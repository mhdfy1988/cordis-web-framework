import { Context } from 'cordis';
import type { Fiber } from 'cordis';
import type { PluginDefinition, PluginHandle, PluginSnapshot, PluginState,
  Runtime, RuntimeSnapshot } from '../contracts/runtime.ts';
import { createDiagnostics } from './diagnostics.ts';
import { createPluginScope, serviceName } from './plugin-scope.ts';

type ScopeBridge = ReturnType<typeof createPluginScope>;
interface RecordEntry {
  plugin: PluginDefinition;
  instanceId: string;
  generation: number;
  fiber?: Fiber;
  scope?: ScopeBridge;
  stopping?: Promise<PluginSnapshot>;
}

// 固定包的公开 FiberState 数值；不把第三方枚举传给业务消费者。
const states: Record<number, PluginState> = {
  0: 'waiting', 1: 'starting', 2: 'ready', 3: 'failed', 4: 'stopped', 5: 'stopping',
};

export function createCordisRuntime(): Runtime {
  const root = new Context();
  const diagnostics = createDiagnostics();
  const records: RecordEntry[] = [];
  const callbacks = new Map<unknown, RecordEntry>();
  const latest = new Map<string, RecordEntry>();
  const owners = new Map<string, RecordEntry>();
  const listeners = new Set<(snapshot: RuntimeSnapshot) => void>();
  const runtimeId = crypto.randomUUID();
  let closed = false;
  let closing: Promise<RuntimeSnapshot> | undefined;
  let sequence = 0;

  function snapshot(record: RecordEntry): PluginSnapshot {
    const errors = diagnostics.snapshot(record.instanceId);
    let state = states[record.fiber?.state ?? 0];
    if (!state) throw new Error('未知 Cordis 状态，需重新评审适配');
    if (state === 'stopped' && errors.some(item => item.phase === 'cleanup')) state = 'cleanup-failed';
    return Object.freeze({ id: record.plugin.id, instanceId: record.instanceId, generation: record.generation, state,
      waitingFor: Object.freeze(state === 'waiting'
        ? (record.plugin.requires ?? []).filter(key => root.get(serviceName(key.id)) === undefined).map(key => key.id)
        : []), diagnostics: errors });
  }
  function inspect(): RuntimeSnapshot {
    return Object.freeze({ closed, plugins: Object.freeze(records.map(snapshot)),
      diagnostics: diagnostics.snapshot() });
  }
  function notify() {
    const value = inspect();
    for (const listener of [...listeners]) {
      try { listener(value); } catch (error) {
        diagnostics.record({ code: 'observer-failed', phase: 'observation' }, error);
        listeners.delete(listener);
      }
    }
  }
  function report(record: RecordEntry, phase: 'activation' | 'cleanup', error: unknown) {
    diagnostics.record({ code: phase === 'activation' ? 'activation-failed' : 'cleanup-failed',
      phase, pluginId: record.plugin.id, instanceId: record.instanceId }, error);
    notify();
    if (phase === 'cleanup') {
      // 清理不完整的消费者不能在新提供者出现时被自动重新激活。
      // 不在清理回调中 await 自身销毁，避免等待当前清理造成死锁。
      void stop(record).catch(error => {
        diagnostics.record({ code: 'runtime-error', phase: 'runtime',
          pluginId: record.plugin.id, instanceId: record.instanceId }, error);
        notify();
      });
    }
  }
  // 上游事件和日志均止于适配层；通过公开 runtime.callback 关联运行实例。
  root.on('internal/plugin', fiber => {
    const record = callbacks.get(fiber.runtime?.callback);
    if (record) record.fiber = fiber;
  });
  root.on('internal/status', () => { notify(); });
  root.logger.exporter({ export(message) {
    if (message.type !== 'error') return;
    const fiber = message.fiber?.deref();
    const record = callbacks.get(fiber?.runtime?.callback);
    for (const error of message.args) {
      if (diagnostics.hasReported(error, record?.instanceId)) continue;
      diagnostics.record({ code: 'runtime-error', phase: 'runtime',
        pluginId: record?.plugin.id, instanceId: record?.instanceId }, error);
    }
    notify();
  } });

  async function settleRecord(record: RecordEntry) {
    try { await record.fiber?.await(); } catch (error) { report(record, 'activation', error); }
    return snapshot(record);
  }
  function stop(record: RecordEntry): Promise<PluginSnapshot> {
    if (record.stopping) return record.stopping;
    const completion = Promise.withResolvers<PluginSnapshot>();
    record.stopping = completion.promise;
    // 取消信号会同步调用用户监听器，幂等句柄必须在发送信号之前可见。
    record.scope?.abort();
    void (async () => {
      await record.fiber!.dispose();
      // 并发的根关闭可能已启动同一销毁，重复 dispose 本身不会等待其清理。
      await settleRecord(record);
      const value = snapshot(record);
      if (value.state === 'stopped') {
        for (const key of record.plugin.provides ?? []) {
          if (owners.get(key.id) === record) owners.delete(key.id);
        }
      }
      notify();
      return value;
    })().then(completion.resolve, completion.reject);
    return record.stopping;
  }
  const runtime: Runtime = {
    load(input) {
      if (closed) throw new Error('运行时已关闭');
      if (!input.id?.trim() || typeof input.setup !== 'function') throw new TypeError('插件需要标识和 setup');
      const previous = latest.get(input.id);
      if (previous && snapshot(previous).state !== 'stopped') throw new Error(`插件尚未干净停用：${input.id}`);
      const copyKeys = (keys = [] as readonly { id: string }[]) => keys.map(key => {
        if (!key.id?.trim()) throw new TypeError('服务标识不能为空');
        return Object.freeze({ id: key.id });
      });
      const plugin = Object.freeze({ id: input.id, setup: input.setup,
        requires: Object.freeze(copyKeys(input.requires)), provides: Object.freeze(copyKeys(input.provides)) });
      if (new Set(plugin.provides.map(key => key.id)).size !== plugin.provides.length) {
        throw new Error('提供服务声明重复');
      }
      for (const key of plugin.provides) {
        if (owners.has(key.id)) throw new Error(`服务已有提供者：${key.id}`);
      }
      const record: RecordEntry = { plugin, instanceId: `${runtimeId}:${++sequence}`, generation: 0 };
      const callback = async function* (ctx: Context) {
        record.generation++;
        const bridge = createPluginScope(ctx, plugin, error => report(record, 'cleanup', error));
        record.scope = bridge;
        yield () => bridge.dispose();
        try {
          await plugin.setup(bridge.scope);
          bridge.assertProvided();
        } catch (error) { report(record, 'activation', error); throw error; }
      };
      callbacks.set(callback, record);
      records.push(record);
      latest.set(plugin.id, record);
      for (const key of plugin.provides) owners.set(key.id, record);
      record.fiber = root.plugin({ name: plugin.id,
        inject: plugin.requires.map(key => serviceName(key.id)), apply: callback });
      notify();
      return Object.freeze({ inspect: () => snapshot(record),
        settle: () => settleRecord(record), stop: () => stop(record) } satisfies PluginHandle);
    },
    inspect,
    forgetStopped(id) {
      const matching = records.filter(record => record.plugin.id === id);
      if (matching.some(record => snapshot(record).state !== 'stopped')) throw new Error('只能归档干净停止的实例');
      for (const record of matching) {
        records.splice(records.indexOf(record), 1);
        for (const [callback, entry] of callbacks) if (entry === record) callbacks.delete(callback);
        if (latest.get(id) === record) latest.delete(id);
      }
    },
    async settle() {
      // 提供者完成可能刚刚触发消费者激活，须继续等待新出现的在途变动。
      do { await Promise.all(records.map(settleRecord)); }
      while (records.some(record => record.fiber?.inertia));
      await Promise.all(records.map(record => record.stopping));
      return inspect();
    },
    audit(requiredPluginIds = [...latest.keys()]) {
      const issues = requiredPluginIds.flatMap(pluginId => {
        const record = latest.get(pluginId);
        const value = record && snapshot(record);
        return value?.state === 'ready' ? [] : [Object.freeze({ pluginId,
          state: value?.state ?? 'not-loaded' as const, waitingFor: value?.waitingFor ?? Object.freeze([]) })];
      });
      return Object.freeze({ ready: !closed && issues.length === 0, issues: Object.freeze(issues) });
    },
    subscribe(listener) {
      if (closed) throw new Error('运行时已关闭');
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    close() {
      if (closing) return closing;
      const completion = Promise.withResolvers<RuntimeSnapshot>();
      closing = completion.promise;
      closed = true;
      records.forEach(record => record.scope?.abort());
      void (async () => {
        await root.fiber.dispose();
        // 显式 stop 已从父作用域移除的资源仍可能在途，关闭也必须等待它们。
        await Promise.all(records.map(settleRecord));
        await Promise.all(records.map(record => record.stopping));
        notify();
        listeners.clear();
        return inspect();
      })().then(completion.resolve, completion.reject);
      return closing;
    },
  };
  return Object.freeze(runtime);
}

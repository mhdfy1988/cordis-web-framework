import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { service } from 'cordis-web-framework/runtime';
import type { PluginScope, Runtime } from 'cordis-web-framework/runtime';
import { createProbes, probe } from './fixtures.ts';

const options = { timeout: 5000 };

test('公开契约：取消回调重入根 close 也共享同一结果且只清理一次', options, async () => {
  const runtime = createCordisRuntime();
  let nested: Promise<unknown> | undefined;
  let releases = 0;
  runtime.load({ id: 'reentrant-close', setup(scope) {
    scope.signal.addEventListener('abort', () => { nested = runtime.close(); }, { once: true });
    scope.onDispose(() => { releases++; });
  } });
  await runtime.settle();
  const outer = runtime.close();
  await outer;
  assert.equal(nested, outer);
  assert.equal(releases, 1);
});

test('公开契约：取消回调重入插件 stop 不重复启动清理', options, async () => {
  const runtime = createCordisRuntime();
  let nested: Promise<unknown> | undefined;
  let releases = 0;
  const handle = runtime.load({ id: 'reentrant-stop', setup(scope) {
    scope.signal.addEventListener('abort', () => { nested = handle.stop(); }, { once: true });
    scope.onDispose(() => { releases++; });
  } });
  await runtime.settle();
  const outer = handle.stop();
  await outer;
  assert.equal(nested, outer);
  assert.equal(releases, 1);
  await runtime.close();
});
function runtimeFor(t: TestContext) {
  const runtime = createCordisRuntime();
  t.after(() => runtime.close().then(() => {}));
  return runtime;
}

test('公开契约：等待者可收尾但不就绪，提供者出现后两个插件真正激活', options, async t => {
  const runtime: Runtime = runtimeFor(t);
  const fixture = createProbes();
  const consumer = runtime.load(fixture.consumer);
  assert.equal((await consumer.settle()).state, 'waiting');
  assert.deepEqual(consumer.inspect().waitingFor, [probe.id]);
  assert.equal(runtime.audit().ready, false);
  assert.equal(runtime.audit(['not-installed']).issues[0].state, 'not-loaded');
  runtime.load(fixture.provider);
  await runtime.settle();
  assert.equal(runtime.audit().ready, true);
  assert.deepEqual(fixture.reads, [1]);
  assert.deepEqual(runtime.inspect().diagnostics, []);
  assert.deepEqual(Object.keys(consumer).sort(), ['inspect', 'settle', 'stop']);
  assert.equal('ctx' in runtime, false);
  assert.equal('fiber' in consumer, false);
});

test('公开契约：异步激活时服务不提前可用，就绪审计保留 starting', options, async t => {
  const runtime = runtimeFor(t);
  const gate = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  t.after(() => gate.resolve());
  let calls = 0;
  const consumer = runtime.load({ id: 'consumer', requires: [probe], setup(scope) {
    calls += scope.get(probe).read();
  } });
  const provider = runtime.load({ id: 'provider', provides: [probe], async setup(scope) {
    scope.provide(probe, { read: () => 1 });
    started.resolve();
    await gate.promise;
  } });
  await started.promise;
  assert.equal(provider.inspect().state, 'starting');
  assert.equal(consumer.inspect().state, 'waiting');
  assert.equal(runtime.audit().ready, false);
  assert.equal(calls, 0);
  gate.resolve();
  await runtime.settle();
  assert.equal(calls, 1);
  assert.equal(runtime.audit().ready, true);
});

test('公开契约：激活失败回收部分资源，保留插件及运行身份，不冒充成功', options, async t => {
  const runtime = runtimeFor(t);
  const resources = new Set<string>();
  const consumer = runtime.load({ id: 'consumer', requires: [probe], setup() { assert.fail('不应激活'); } });
  const failed = runtime.load({ id: 'broken', provides: [probe], setup(scope) {
    resources.add('partial');
    scope.onDispose(() => { resources.delete('partial'); });
    scope.provide(probe, { read: () => 1 });
    throw new Error('预期启动错误');
  } });
  const value = await failed.settle();
  await runtime.settle();
  assert.equal(value.state, 'failed');
  assert.equal(resources.size, 0);
  assert.equal(consumer.inspect().state, 'waiting');
  assert.equal(runtime.audit().ready, false);
  assert.deepEqual(value.diagnostics.map(item => [item.code, item.pluginId, item.instanceId, item.message]),
    [['activation-failed', 'broken', value.instanceId, '预期启动错误']]);
  const stopped = await failed.stop();
  assert.equal(stopped.state, 'stopped');
  assert.equal(stopped.diagnostics.length, 1, '停用不能抹掉失败历史');
});

test('公开契约：消费者异步清理完成后才关闭提供者，重复 stop 共享同一结果', options, async t => {
  const runtime = runtimeFor(t);
  const fixture = createProbes();
  const gate = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  t.after(() => gate.resolve());
  const provider = runtime.load(fixture.provider);
  runtime.load({ id: 'consumer', requires: [probe], setup(scope) {
    scope.onDispose(async () => {
      started.resolve();
      await gate.promise;
      fixture.events.push(`consumer:read:${scope.get(probe).read()}`);
    });
  } });
  await runtime.settle();
  const stopping = provider.stop();
  assert.equal(provider.stop(), stopping);
  await started.promise;
  assert.equal(provider.inspect().state, 'stopping');
  assert.equal(fixture.resources.size, 1);
  gate.resolve();
  assert.equal((await stopping).state, 'stopped');
  assert.deepEqual(fixture.events.slice(-2), ['consumer:read:1', 'provider:1:closed']);
  assert.equal(fixture.resources.size, 0);
  assert.equal(runtime.audit().ready, false);
});

test('公开契约：三轮重新装配有新运行身份、重绑定消费者且不累积资源', options, async t => {
  const runtime = runtimeFor(t);
  const fixture = createProbes();
  const consumer = runtime.load(fixture.consumer);
  const identities = new Set<string>();
  for (let round = 1; round <= 3; round++) {
    const provider = runtime.load(fixture.provider);
    await runtime.settle();
    identities.add(provider.inspect().instanceId);
    assert.equal(fixture.resources.size, 1);
    assert.equal(consumer.inspect().state, 'ready');
    assert.equal(consumer.inspect().generation, round);
    assert.equal(runtime.audit().ready, true);
    await provider.stop();
    await provider.stop();
    await runtime.settle();
    assert.equal(consumer.inspect().state, 'waiting');
    assert.equal(fixture.resources.size, 0);
  }
  assert.deepEqual(fixture.reads, [1, 2, 3]);
  assert.equal(identities.size, 3);
  assert.equal(fixture.events.filter(value => value.startsWith('consumer:closed')).length, 3);
});

test('公开契约：清理失败可定位且不阻止其他资源释放，禁止同身份直接重用', options, async t => {
  const runtime = runtimeFor(t);
  const resources = new Set(['first', 'second']);
  const plugin = { id: 'bad-cleanup', setup(scope: PluginScope) {
    scope.onDispose(() => { resources.delete('first'); });
    scope.onDispose(() => { resources.delete('second'); throw new Error('预期清理错误'); });
  } };
  const handle = runtime.load(plugin);
  await handle.settle();
  const result = await handle.stop();
  assert.equal(result.state, 'cleanup-failed');
  assert.equal(result.diagnostics[0].phase, 'cleanup');
  assert.equal(result.diagnostics[0].pluginId, plugin.id);
  assert.equal(result.diagnostics[0].message, '预期清理错误');
  assert.equal(resources.size, 0);
  assert.equal(runtime.audit().ready, false);
  assert.throws(() => runtime.load(plugin), /尚未干净停用/);
});

test('公开契约：两个运行时的同名插件、服务、诊断与关闭互不干扰', options, async t => {
  const a = runtimeFor(t);
  const b = runtimeFor(t);
  const first = createProbes();
  const second = createProbes();
  a.load(first.provider);
  b.load(second.provider);
  a.load(first.consumer);
  b.load(second.consumer);
  await Promise.all([a.settle(), b.settle()]);
  a.load({ id: 'error', setup() { throw new Error('仅 A 的错误'); } });
  await a.settle();
  await a.close();
  assert.equal(first.resources.size, 0);
  assert.equal(second.resources.size, 1);
  assert.equal(b.audit().ready, true);
  assert.deepEqual(b.inspect().diagnostics, []);
  assert.notEqual(a.inspect().plugins[0].instanceId, b.inspect().plugins[0].instanceId);
});

test('公开契约：停用等待实例后服务出现不复活，终态通知恰好一次', options, async t => {
  const runtime = runtimeFor(t);
  const fixture = createProbes();
  const consumer = runtime.load(fixture.consumer);
  let transitions = 0;
  let previous = consumer.inspect().state;
  const off = runtime.subscribe(value => {
    const current = value.plugins.find(item => item.instanceId === consumer.inspect().instanceId)!.state;
    if (previous !== current && current === 'stopped') transitions++;
    previous = current;
  });
  await consumer.stop();
  await consumer.stop();
  runtime.load(fixture.provider);
  await runtime.settle();
  assert.equal(consumer.inspect().state, 'stopped');
  assert.deepEqual(fixture.reads, []);
  assert.equal(transitions, 1);
  off();
});

test('公开契约：只读快照、取消订阅及故障观察者不破坏生命周期', options, async t => {
  const runtime = runtimeFor(t);
  let calls = 0;
  const off = runtime.subscribe(() => { calls++; });
  runtime.subscribe(() => { throw new Error('观察者错误'); });
  const plugin = runtime.load({ id: 'plugin', setup() {} });
  await runtime.settle();
  assert.equal(runtime.audit().ready, true);
  assert.equal(runtime.inspect().diagnostics[0].code, 'observer-failed');
  const value = runtime.inspect();
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.plugins[0].waitingFor), true);
  assert.throws(() => { (value.plugins as unknown[]).push({}); }, TypeError);
  off();
  const before = calls;
  await plugin.stop();
  assert.equal(calls, before);
});

test('公开契约：声明约束失败有诊断，不能以遗漏提供服务冒充就绪', options, async t => {
  const runtime = runtimeFor(t);
  const omitted = runtime.load({ id: 'omitted', provides: [probe], setup() {} });
  assert.equal((await omitted.settle()).state, 'failed');
  assert.match(omitted.inspect().diagnostics[0].message, /未提供声明服务/);
  const undeclared = runtime.load({ id: 'undeclared', setup(scope) {
    scope.get(service('not-declared'));
  } });
  assert.equal((await undeclared.settle()).state, 'failed');
  assert.match(undeclared.inspect().diagnostics[0].message, /未声明消费服务/);
  assert.throws(() => runtime.load({ id: 'omitted', setup() {} }), /尚未干净停用/);
  assert.throws(() => runtime.load({ id: 'duplicate-provider', provides: [probe], setup() {} }), /已有提供者/);
});

test('公开契约：旧作用域停止后不能读取依赖或登记新资源', options, async t => {
  const runtime = runtimeFor(t);
  let borrowed: PluginScope | undefined;
  const fixture = createProbes();
  runtime.load(fixture.provider);
  const consumer = runtime.load({ id: 'consumer', requires: [probe], setup(scope) { borrowed = scope; } });
  await runtime.settle();
  await consumer.stop();
  assert.throws(() => borrowed!.get(probe), /已关闭/);
  assert.throws(() => borrowed!.onDispose(() => {}), /已关闭/);
});

test('公开契约：在途激活收到停用信号，资源真实收尾后才到终态', options, async t => {
  const runtime = runtimeFor(t);
  const started = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();
  t.after(() => gate.resolve());
  let live = 0;
  let signal: AbortSignal | undefined;
  const handle = runtime.load({ id: 'slow', async setup(scope) {
    signal = scope.signal;
    live++;
    scope.onDispose(() => { live--; });
    started.resolve();
    await gate.promise;
  } });
  await started.promise;
  const stopping = handle.stop();
  assert.equal(signal!.aborted, true);
  assert.notEqual(handle.inspect().state, 'stopped');
  assert.equal(live, 1);
  gate.resolve();
  assert.equal((await stopping).state, 'stopped');
  assert.equal(live, 0);
});

test('公开契约：close 等待资源并幂等，关闭后禁止装配和订阅', options, async t => {
  const runtime = runtimeFor(t);
  const fixture = createProbes();
  runtime.load(fixture.provider);
  runtime.load(fixture.consumer);
  await runtime.settle();
  const closing = runtime.close();
  assert.equal(runtime.close(), closing);
  assert.throws(() => runtime.load(fixture.provider), /已关闭/);
  const value = await closing;
  assert.equal(value.closed, true);
  assert.equal(value.plugins.every(item => item.state === 'stopped'), true);
  assert.equal(fixture.resources.size, 0);
  assert.equal(runtime.audit().ready, false);
  assert.throws(() => runtime.subscribe(() => {}), /已关闭/);
});

test('公开契约：依赖撤销时清理失败的消费者不会被下一提供者自动复活', options, async t => {
  const runtime = runtimeFor(t);
  const fixture = createProbes();
  let calls = 0;
  const consumer = runtime.load({ id: 'consumer', requires: [probe], setup(scope) {
    calls++;
    scope.onDispose(() => { throw new Error('无法确认资源释放'); });
  } });
  const provider = runtime.load(fixture.provider);
  await runtime.settle();
  await provider.stop();
  await runtime.settle();
  assert.equal(consumer.inspect().state, 'cleanup-failed');
  runtime.load(fixture.provider);
  await runtime.settle();
  assert.equal(calls, 1);
  assert.equal(consumer.inspect().state, 'cleanup-failed');
});

test('公开契约：相同 Error 对象在不同插件或阶段发生，诊断不能相互抹掉', options, async t => {
  const runtime = runtimeFor(t);
  const shared = new Error('共用错误对象');
  for (const id of ['first', 'second']) {
    const handle = runtime.load({ id, setup(scope) {
      scope.onDispose(() => { throw shared; });
      throw shared;
    } });
    await handle.settle();
    await handle.stop();
    assert.deepEqual(handle.inspect().diagnostics.map(item => item.phase), ['activation', 'cleanup']);
  }
  assert.equal(runtime.inspect().diagnostics.length, 4);
});

test('公开契约：失败实例显式干净停用后可用新运行身份重新装配', options, async t => {
  const runtime = runtimeFor(t);
  const failed = runtime.load({ id: 'retry', setup() { throw new Error('首次失败'); } });
  await failed.settle();
  await failed.stop();
  const next = runtime.load({ id: 'retry', setup() {} });
  await next.settle();
  assert.equal(next.inspect().state, 'ready');
  assert.notEqual(next.inspect().instanceId, failed.inspect().instanceId);
  assert.equal(failed.inspect().diagnostics.length, 1);
  assert.equal(runtime.audit(['retry']).ready, true);
});

test('公开契约：插件 stop 与根 close 并发时，两者都等待已在途的清理', options, async t => {
  const runtime = runtimeFor(t);
  const gate = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  t.after(() => gate.resolve());
  let live = true;
  const plugin = runtime.load({ id: 'concurrent', setup(scope) {
    scope.onDispose(async () => {
      started.resolve();
      await gate.promise;
      live = false;
    });
  } });
  await plugin.settle();
  const stopping = plugin.stop();
  await started.promise;
  let closed = false;
  const closing = runtime.close().then(value => { closed = true; return value; });
  await Promise.resolve();
  assert.equal(live, true);
  assert.equal(closed, false);
  gate.resolve();
  const [stopped, result] = await Promise.all([stopping, closing]);
  assert.equal(live, false);
  assert.equal(stopped.state, 'stopped');
  assert.equal(result.plugins[0].state, 'stopped');
});

test('公开契约：根 close 先开始后调用 stop，不会提前返回中间状态', options, async t => {
  const runtime = runtimeFor(t);
  const gate = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  t.after(() => gate.resolve());
  const plugin = runtime.load({ id: 'concurrent', setup(scope) {
    scope.onDispose(async () => { started.resolve(); await gate.promise; });
  } });
  await plugin.settle();
  const closing = runtime.close();
  await started.promise;
  let done = false;
  const stopping = plugin.stop().then(value => { done = true; return value; });
  await Promise.resolve();
  assert.equal(done, false);
  gate.resolve();
  assert.equal((await stopping).state, 'stopped');
  await closing;
});

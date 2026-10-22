import type { HostEnvironment } from '../../contracts/composition.ts';
import type { HostHandle, HostOptions, HostResourceContext, HostSnapshot } from '../../contracts/host.ts';
import type { Cleanup, Runtime } from '../../contracts/runtime.ts';
import type { ShutdownSnapshot } from '../../contracts/shutdown.ts';
import { assembleComposition } from '../../plugin-composition/index.ts';
import { createShutdownController } from '../../shutdown/index.ts';
import { freezeData } from '../../data/immutable.ts';
import { hostReadinessValidator } from '../../validation-zod/index.ts';
import { documentValidator } from '../../validation-zod/index.ts';
import { startPluginManager } from '../../plugin-management/index.ts';
import type { PluginManager } from '../../contracts/management.ts';

export class HostStartError extends Error {
  readonly shutdown: ShutdownSnapshot;
  readonly host: HostHandle;
  constructor(cause: unknown, shutdown: ShutdownSnapshot, host: HostHandle) {
    super('宿主资源启动失败', { cause });
    this.name = 'HostStartError'; this.shutdown = shutdown; this.host = host;
  }
}

/** 共享的是生命周期协调，不是 DOM、HTTP 对象或全局单例。 */
export async function openHost(options: HostOptions, environment: HostEnvironment,
  acquire: (context: HostResourceContext) => Promise<void> | void): Promise<HostHandle> {
  const timeoutMs = options.shutdownTimeoutMs ?? 5000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) throw new TypeError('关闭预算无效');
  let required: readonly string[] | undefined;
  if (options.requiredPluginIds !== undefined) {
    const parsed = hostReadinessValidator.validate(options.requiredPluginIds);
    if (!parsed.ok) throw new TypeError('必需插件名单无效');
    required = Object.freeze(parsed.value);
  }
  let management: PluginManager | undefined;
  let runtime: Runtime;
  if (options.management) {
    const parsed = documentValidator.validate(options.document);
    if (!parsed.ok || parsed.value.plugins.length || Object.keys(parsed.value.bindings).length || options.catalog.size) throw new Error('管理模式不能混用静态装配目录');
    runtime = options.createRuntime();
    management = await startPluginManager({ ...options.management, runtime, environment });
  } else runtime = await assembleComposition(options.document, options.catalog, { createRuntime: options.createRuntime, environment });
  const isReady = () => required === undefined && management ? management.inspect().ready : runtime.audit(required).ready;
  const stableEnvironment = freezeData({ platform: environment.platform, capabilities: [...environment.capabilities] });
  let release: Cleanup | undefined;
  const closingRuntime: Runtime = { ...runtime, async close() {
    let failed = false;
    let releaseError: unknown;
    const draining = management?.drain();
    try { await release?.(); await draining; } catch (error) { failed = true; releaseError = error; }
    if (management) await management.close();
    const result = await runtime.close();
    if (failed) throw new Error('宿主资源清理失败', { cause: releaseError });
    return result;
  } };
  const shutdown = createShutdownController(closingRuntime, { timeoutMs });
  const view = Object.freeze({ inspect: () => runtime.inspect(), audit: (ids: readonly string[] | undefined = required) =>
    ids === undefined && management ? { ...runtime.audit(management.inspect().plugins.filter(item => item.required).map(item => item.id)), ready: isReady() } : runtime.audit(ids),
    subscribe: runtime.subscribe.bind(runtime), ...(management ? { management } : {}) });
  const handle: HostHandle = Object.freeze({
    ...(management ? { management } : {}),
    inspect(): HostSnapshot {
      const report = shutdown.inspect();
      return Object.freeze({ ...report, environment: stableEnvironment,
        state: report.state === 'running' ? (isReady() ? 'ready' : 'not-ready') : report.state });
    }, stop: () => shutdown.stop(), completion: () => shutdown.completion(),
  });
  try {
    if (!isReady()) throw new Error('必需插件尚未就绪');
    await acquire({ runtime: view, onRelease(cleanup) {
      if (release) throw new Error('宿主资源清理只能登记一次');
      release = cleanup;
    } });
    if (!isReady()) throw new Error('资源申请期间插件失去就绪状态');
    return handle;
  } catch (cause) { throw new HostStartError(cause, await shutdown.stop(), handle); }
}

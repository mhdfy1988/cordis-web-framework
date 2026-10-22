import type { Runtime, RuntimeSnapshot } from '../contracts/runtime.ts';
import type { ShutdownController, ShutdownSnapshot, ShutdownState } from '../contracts/shutdown.ts';
export type { ShutdownController, ShutdownSnapshot, ShutdownState } from '../contracts/shutdown.ts';

/** 只协调关闭的观察预算；生命周期和服务清理继续交给运行时，不造第二套调度。 */
export function createShutdownController(runtime: Runtime, options: { timeoutMs?: number } = {}): ShutdownController {
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) throw new TypeError('关闭预算必须是有效毫秒整数');
  let state: ShutdownState = 'running';
  let error: string | undefined;
  let observed: Promise<ShutdownSnapshot> | undefined;
  let actual: Promise<ShutdownSnapshot> | undefined;
  const inspect = (): ShutdownSnapshot => Object.freeze({ state, runtime: runtime.inspect(), ...(error ? { error } : {}) });
  function begin() {
    if (actual) return;
    state = 'stopping';
    const observedResult = Promise.withResolvers<ShutdownSnapshot>();
    const actualResult = Promise.withResolvers<ShutdownSnapshot>();
    // 先登记幂等句柄，底层 close 的取消回调可能同步重入 stop。
    observed = observedResult.promise;
    actual = actualResult.promise;
    const timer = setTimeout(() => {
      state = 'timed-out'; observedResult.resolve(inspect());
    }, timeoutMs);
    function finish(failure?: unknown) {
      if (failure !== undefined) {
        state = 'cleanup-failed';
        error = failure instanceof Error ? failure.message : String(failure);
      }
      clearTimeout(timer);
      const report = inspect();
      observedResult.resolve(report);
      actualResult.resolve(report);
    }
    let closing: Promise<RuntimeSnapshot>;
    try { closing = runtime.close(); } catch (failure) { closing = Promise.reject(failure); }
    void Promise.resolve(closing).then(
      result => {
        state = result.diagnostics.some(item => item.phase === 'cleanup') ? 'cleanup-failed' : 'stopped';
        finish();
      }, failure => {
        // Promise 可用 undefined 拒绝；失败状态必须独立设置，不能依赖错误值存在。
        state = 'cleanup-failed';
        finish(failure);
      },
    );
  }
  return Object.freeze({ inspect,
    stop() { begin(); return observed!; },
    completion() { begin(); return actual!; },
  });
}

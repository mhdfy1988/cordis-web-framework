import { defineComponent, h, onUnmounted } from 'vue';
import { startVueHost } from 'cordis-web-framework/presentation-vue';
import { startBrowserHost, HostStartError } from 'cordis-web-framework/hosts/browser';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export async function runFailureCases() {
  const target = document.createElement('div'); target.hidden = true; document.body.append(target);
  const options = { target, document: { formatVersion: 1, plugins: [], bindings: {} }, catalog: new Map(),
    createRuntime: createCordisRuntime, shutdownTimeoutMs: 10 };
  try {
    const pending = Promise.withResolvers<void>();
    let startupError: HostStartError | undefined;
    try {
      await startBrowserHost({ ...options, mount(_target, _runtime, release) {
        release(() => pending.promise); throw new Error('部分初始化失败');
      } });
    } catch (error) { check(error instanceof HostStartError, '启动错误应保留收尾句柄'); startupError = error; }
    check(startupError?.shutdown.state === 'timed-out', '必须报告超时');
    let rejected = false;
    try { await startBrowserHost({ ...options, mount() {} }); } catch { rejected = true; }
    check(rejected, '未完成清理的容器不可重新挂载');
    pending.resolve();
    check((await startupError.host.completion()).state === 'stopped', '必须可继续观察实际收尾');
    const badCleanup = defineComponent({ setup() {
      onUnmounted(() => { throw new Error('同步卸载失败'); }); return () => h('span', '测试');
    } });
    const host = await startVueHost({ ...options, component: badCleanup, onError() {} });
    check((await host.stop()).state === 'cleanup-failed', 'Vue 卸载错误不能冒充干净停止');
    rejected = false;
    try { await startBrowserHost({ ...options, mount() {} }); } catch { rejected = true; }
    check(rejected, '清理失败的容器不能静默复用');
  } finally { target.remove(); }
  return 'passed';
}

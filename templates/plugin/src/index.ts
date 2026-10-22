import type { PluginManifest, RegisteredPlugin } from 'cordis-web-framework';

/** 工厂和 prepare 不申请资源；每次 setup 只拥有本轮实例的资源。 */
export default function createPlugin(manifest: PluginManifest): RegisteredPlugin {
  return { manifest, prepare(input) {
    if (!input || typeof input !== 'object' || typeof (input as { message?: unknown }).message !== 'string') {
      return { ok: false, issues: [{ path: ['message'], message: '请输入问候文本' }] };
    }
    const message = (input as { message: string }).message;
    return { ok: true, value(scope) {
      scope.provide({ id: 'example.greeting' }, { say: () => message });
      scope.onDispose(() => { /* 在这里关闭该实例申请的订阅、计时器等资源。 */ });
    } };
  } };
}

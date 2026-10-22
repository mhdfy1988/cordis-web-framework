import type { PluginScope } from '../../contracts/runtime.ts';
import type { PluginArtifact } from '../../contracts/management.ts';

/** 样式和对象 URL 随插件退出释放；可信 CSS 不是样式沙箱，作者仍须使用根作用域。 */
export function createBrowserPluginResources(target: Element = document.head) {
  return Object.freeze({
    style(scope: Pick<PluginScope, 'onDispose'>, id: string, css: string) {
      const element = document.createElement('style'); element.dataset.pluginStyle = id; element.textContent = css;
      scope.onDispose(() => { element.remove(); }); target.append(element);
    },
    asset(scope: Pick<PluginScope, 'onDispose'>, resource: PluginArtifact['assets'][number]) {
      const url = URL.createObjectURL(new Blob([resource.source], { type: resource.type }));
      try { scope.onDispose(() => { URL.revokeObjectURL(url); }); } catch (error) { URL.revokeObjectURL(url); throw error; }
      return url;
    },
  });
}

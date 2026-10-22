import type { App } from 'vue';
import { createMemoryHistory, createRouter, createWebHashHistory, isNavigationFailure, NavigationFailureType } from 'vue-router';
import type { UiNavigation, UiRoute } from '../contracts/navigation.ts';
import type { UiRegistry } from '../contracts/ui.ts';
import { uiNavigationValidator, uiRouteValidator } from '../validation-zod/index.ts';
export type { UiNavigation, UiRoute } from '../contracts/navigation.ts';

/** Vue Router 仅管理地址与历史；实际页面仍从公开界面位置呈现，不把业务组件写入路由核心。 */
export function createVueNavigation(options: { ui: UiRegistry; target: string; history: 'hash' | 'memory'; onError: () => void }) {
  if (!['hash', 'memory'].includes(options.history) || !options.target.trim()) throw new TypeError('导航模式或出口无效');
  const history = options.history === 'hash' ? createWebHashHistory() : createMemoryHistory();
  const router = createRouter({ history, strict: true, sensitive: true, routes: [{ path: '/:pathMatch(.*)*', name: Symbol('未找到'), component: { render: () => null } }] });
  const routes = new Map<string, { spec: UiRoute; dispose: () => void }>();
  const navigation = new Map<string, UiNavigation>(); const listeners = new Set<() => void>();
  let closed = false; let installed = false;
  const report = () => { try { options.onError(); } catch { /* 错误输出不得破坏路由撤销。 */ } };
  const notify = () => { for (const listener of [...listeners]) try { listener(); } catch { report(); } };
  const afterEach = router.afterEach(notify); const removeError = router.onError(report);
  const rematch = () => { if (installed && !closed) void router.replace(router.currentRoute.value.fullPath).catch(report); };
  const current = () => { const name = router.currentRoute.value.name; return typeof name === 'string' && routes.has(name) ? name : undefined; };
  return Object.freeze({
    install(app: App) { if (closed || installed) throw new Error('导航只能绑定一个存活的 Vue 应用'); installed = true; app.use(router); },
    async ready() {
      if (!installed || closed) throw new Error('请先绑定导航适配');
      if (options.history === 'memory') await router.push('/');
      await router.isReady();
    },
    register(input: UiRoute) {
      if (closed) throw new Error('导航已关闭');
      const parsed = uiRouteValidator.validate(input); if (!parsed.ok) throw new TypeError('路由定义无效');
      const spec = Object.freeze(parsed.value);
      if (routes.size >= 256) throw new Error('路由容量超限');
      if (routes.has(spec.id) || [...routes.values()].some(route => route.spec.path === spec.path)) throw new Error(`路由冲突：${spec.id}`);
      const stop = options.ui.inject(options.target, () => options.ui.registerDynamic({ id: `route.${spec.id}`, target: options.target,
        key: spec.id, range: '^1.0.0', renderer: 'vue', view: spec.view }).dispose);
      const remove = router.addRoute({ name: spec.id, path: spec.path, component: { render: () => null } });
      const owned = { spec, dispose: () => { stop(); remove(); } }; routes.set(spec.id, owned); rematch(); notify();
      return () => {
        if (routes.get(spec.id) !== owned) return;
        routes.delete(spec.id); owned.dispose();
        for (const [id, item] of navigation) if (item.routeId === spec.id) navigation.delete(id);
        rematch(); notify();
      };
    },
    registerNavigation(input: UiNavigation) {
      if (closed) throw new Error('导航已关闭');
      const parsed = uiNavigationValidator.validate(input); if (!parsed.ok) throw new TypeError('导航定义无效');
      const spec = Object.freeze(parsed.value);
      if (navigation.size >= 256) throw new Error('导航容量超限');
      if (!routes.has(spec.routeId)) throw new Error('导航引用的路由尚未登记');
      if (navigation.has(spec.id)) throw new Error(`导航冲突：${spec.id}`);
      navigation.set(spec.id, spec); notify();
      return () => { if (navigation.get(spec.id) === spec) { navigation.delete(spec.id); notify(); } };
    },
    async navigate(id: string) {
      if (closed || !routes.has(id)) throw new Error('目标路由不可用');
      const result = await router.push({ name: id });
      // 重复访问当前地址不算失败；其他导航失败不能冒充成功。
      if (result && !isNavigationFailure(result, NavigationFailureType.duplicated)) throw new Error('导航没有完成');
    },
    current,
    list: () => Object.freeze([...navigation.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))),
    path: (id: string) => routes.get(id)?.spec.path,
    subscribe(listener: () => void) { if (closed) throw new Error('导航已关闭'); listeners.add(listener); return () => { listeners.delete(listener); }; },
    inspect: () => Object.freeze({ routes: routes.size, navigation: navigation.size, listeners: listeners.size, closed }),
    close() {
      if (closed) return; closed = true;
      for (const route of routes.values()) route.dispose(); routes.clear(); navigation.clear();
      afterEach(); removeError(); history.destroy(); listeners.clear();
    },
  });
}
export type VueNavigation = ReturnType<typeof createVueNavigation>;

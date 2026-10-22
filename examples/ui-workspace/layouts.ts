import { defineComponent, h, type Component, type PropType } from 'vue';
import type { UiAccess, UiContext } from 'cordis-web-framework/ui';
import { localPlugin, sessionId, uiKey } from './contracts.ts';

/** 两种布局共享位置契约，但不是同一个 DOM 换样式。页面／业务不导入布局实现。 */
export function layoutViews(Outlet: Component) {
  const props = { uiAccess: { type: Object as PropType<UiAccess>, required: true } } as const;
  const root: UiContext = { scope: 'root', props: {} };
  const session: UiContext = { scope: 'session', sessionId, props: {} };
  const navigation = (access: UiAccess) => h('nav', { 'aria-label': '工作区导航' }, h(Outlet, { target: 'workspace.nav', context: root, access }));
  const content = (access: UiAccess) => h('main', h(Outlet, { target: 'workspace.content', context: session, access }));
  // 当前路由键由页面协调层提供；布局只提供位置，不知道业务路由名称。
  return {
    sidebar: defineComponent({ inheritAttrs: false, props, setup: value => () => h('div', { class: 'cw-layout sidebar', 'data-layout': 'sidebar' }, [
      h('aside', [h('h1', '记录工作区'), navigation(value.uiAccess)]), content(value.uiAccess),
    ]) }),
    topbar: defineComponent({ inheritAttrs: false, props, setup: value => () => h('div', { class: 'cw-layout topbar', 'data-layout': 'topbar' }, [
      h('header', [h('h1', '记录工作区'), navigation(value.uiAccess)]), content(value.uiAccess),
    ]) }),
  };
}
export function layoutPlugin(kind: 'sidebar' | 'topbar') {
  return localPlugin('workspace.layout', [uiKey], [], scope => {
    const handle = scope.get(uiKey).register({ id: `layout.${kind}`, target: 'root', range: '^1', renderer: 'vue', view: `layout.${kind}`,
      children: [{ name: 'workspace.nav', kind: 'list', scope: 'root', version: '1.0.0' },
        { name: 'workspace.content', kind: 'keyed', scope: 'session', version: '1.0.0' }] });
    scope.onDispose(handle.dispose);
  });
}

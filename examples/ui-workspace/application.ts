import { defineComponent, h, onScopeDispose, shallowRef, type Component, type PropType } from 'vue';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { startVueHost } from 'cordis-web-framework/presentation-vue';
import { createUiRegistry, type UiAccess, type UiContext } from 'cordis-web-framework/ui';
import { createCommandRegistry } from 'cordis-web-framework/commands';
import { createVueUi } from 'cordis-web-framework/presentation-vue/ui';
import { createVueNavigation, type VueNavigation } from 'cordis-web-framework/presentation-vue/routing';
import { bindCommandShortcuts, createVueTheme } from 'cordis-web-framework/presentation-vue/controls';
import { createJsonClient } from 'cordis-web-framework/http-json';
import { createEditorSession, type EditorSession } from '../records/browser/editor-session.ts';
import { commandsKey, editorKey, localPlugin, navigationKey, sessionId, uiKey } from './contracts.ts';
import { layoutPlugin, layoutViews } from './layouts.ts';
import { helpFeature, recordsFeature } from './features.ts';
import { recordView } from './record-view.ts';
import type { PluginHandle, Runtime } from 'cordis-web-framework';

export async function startUiWorkspace(options: { target: HTMLElement; baseUrl: string; history?: 'hash' | 'memory'; onError: (error: unknown) => void }) {
  const ui = createUiRegistry(); const commands = createCommandRegistry(); const theme = createVueTheme(options.target);
  let navigation: VueNavigation; let editor: EditorSession; let runtime: Runtime; let token: string | undefined;
  let layout: PluginHandle | undefined; let help: PluginHandle | undefined; let themeLease: (() => void) | undefined;
  let changing = false; let activeLayout: 'sidebar' | 'topbar' = 'sidebar';
  const initialHandles = new Map<string, PluginHandle>();
  const views = new Map<string, Component>();
  const presenter = createVueUi({ registry: ui, views, onError: options.onError });
  // 布局提供容器，路由适配只在这里把当前地址映射成键控出口。
  const RoutedOutlet = defineComponent({ inheritAttrs: false, props: { target: { type: String, required: true }, context: { type: Object as PropType<UiContext>, required: true }, access: Object as PropType<UiAccess> }, setup(props) {
    const version = shallowRef(0); onScopeDispose(navigation.subscribe(() => { version.value++; }));
    return () => { version.value;
      return props.target === 'workspace.content' && !navigation.current() ? h('section', { role: 'status' }, '页面不存在或扩展已停用')
        : h(presenter.Outlet, { ...props, entryKey: props.target === 'workspace.content' ? navigation.current() : undefined });
    };
  } });
  const layouts = layoutViews(RoutedOutlet); views.set('layout.sidebar', layouts.sidebar); views.set('layout.topbar', layouts.topbar);
  views.set('navigation', defineComponent({ inheritAttrs: false, setup() {
    const version = shallowRef(0); onScopeDispose(navigation.subscribe(() => { version.value++; }));
    return () => { version.value; return h('ul', navigation.list().map(item => h('li', { key: item.id }, h('a', {
      href: `#${navigation.path(item.routeId)}`, 'aria-current': navigation.current() === item.routeId ? 'page' : undefined,
      onClick(event: MouseEvent) { if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); void navigation.navigate(item.routeId).catch(options.onError); },
    }, item.label)))); };
  } }));
  views.set('records.editor', recordView(() => editor, commands));
  views.set('help', defineComponent({ inheritAttrs: false, setup: () => () => h('section', { class: 'help' }, [h('h2', '工作区帮助'), h('p', '保存快捷键：Ctrl / ⌘ + S'), h('p', '切换布局或页面不会丢失草稿。')]) }));
  const foundation = localPlugin('workspace.foundation', [], [uiKey, commandsKey, navigationKey], scope => {
    scope.onDispose(() => ui.close()); scope.onDispose(() => commands.close()); scope.onDispose(() => theme.close());
    navigation = createVueNavigation({ ui, target: 'workspace.content', history: options.history ?? 'hash', onError: () => options.onError(new Error('导航失败')) });
    scope.onDispose(() => navigation.close());
    scope.onDispose(bindCommandShortcuts(options.target, commands, () => ({ sessionId })));
    themeLease = theme.register({ id: 'light', tokens: { '--cw-accent': '#2866a6', '--cw-surface': '#ffffff', '--cw-text': '#202a36', '--cw-muted': '#616d7d' } });
    scope.provide(uiKey, ui); scope.provide(commandsKey, commands); scope.provide(navigationKey, navigation);
  });
  const business = localPlugin('workspace.editor', [], [editorKey], scope => {
    editor = createEditorSession(createJsonClient({ baseUrl: options.baseUrl, credential: () => token }), value => { token = value; });
    scope.provide(editorKey, editor); scope.onDispose(() => { editor.dispose(); token = undefined; });
  });
  const initialLayout = layoutPlugin('sidebar'); const records = recordsFeature(); const initialHelp = helpFeature();
  const modules = [foundation, business, initialLayout, records, initialHelp].map(item => item.module);
  const host = await startVueHost({ target: options.target, component: presenter.Root, configure: app => navigation.install(app), onError: options.onError,
    requiredPluginIds: ['workspace.foundation', 'workspace.editor', 'workspace.layout', 'workspace.records'],
    createRuntime() {
      const base = createCordisRuntime();
      runtime = { ...base, load(definition) { const handle = base.load(definition); initialHandles.set(definition.id, handle); return handle; } };
      return runtime;
    },
    document: { formatVersion: 1, plugins: modules.map(module => ({ id: module.manifest.id, version: '1.0.0', entry: module.manifest.id })),
      bindings: { [uiKey.id]: 'workspace.foundation', [commandsKey.id]: 'workspace.foundation', [navigationKey.id]: 'workspace.foundation', [editorKey.id]: 'workspace.editor' } },
    catalog: new Map(modules.map(module => [module.manifest.id, module])),
  });
  try { await navigation!.ready(); } catch (error) { await host.stop(); throw error; }
  // 启动装配拥有第一代句柄；后续通过公开运行接口按插件身份停用，不接触 Cordis 对象。
  async function stopById(id: string, handle?: PluginHandle) {
    if (handle) { const result = await handle.stop(); if (result.state !== 'stopped') throw new Error('插件撤销未完成'); return; }
    // 初始句柄从装配创建时记录，不查私有 fiber 或执行第二套清理。
    const initial = initialHandles.get(id); if (!initial) throw new Error('初始插件句柄缺失');
    const result = await initial.stop(); if (result.state !== 'stopped') throw new Error('插件撤销未完成');
  }
  return Object.freeze({ host, ui, commands, navigation: navigation!, editor: editor!,
    async changeLayout(kind: 'sidebar' | 'topbar') {
      if (!['sidebar', 'topbar'].includes(kind) || changing || host.inspect().state !== 'ready') throw new Error('布局切换不可用');
      if (kind === activeLayout) return; changing = true;
      try { await stopById('workspace.layout', layout); layout = runtime!.load(layoutPlugin(kind).definition);
        const result = await layout.settle(); if (result.state !== 'ready') throw new Error('新布局未就绪'); activeLayout = kind;
      } finally { changing = false; }
    },
    async toggleHelp(enabled: boolean) {
      if (enabled) {
        if (runtime!.inspect().plugins.some(plugin => plugin.id === 'workspace.help' && plugin.state === 'ready')) return;
        help = runtime!.load(helpFeature().definition); if ((await help.settle()).state !== 'ready') throw new Error('帮助未就绪');
      } else await stopById('workspace.help', help);
    },
    changeTheme(dark: boolean) {
      if (host.inspect().state !== 'ready') throw new Error('工作区已停止');
      themeLease?.(); themeLease = theme.register({ id: dark ? 'dark' : 'light', tokens: dark
        ? { '--cw-accent': '#9dc5ff', '--cw-surface': '#202a36', '--cw-text': '#eef3fa', '--cw-muted': '#b4c0d1' }
        : { '--cw-accent': '#2866a6', '--cw-surface': '#ffffff', '--cw-text': '#202a36', '--cw-muted': '#616d7d' } });
    },
  });
}

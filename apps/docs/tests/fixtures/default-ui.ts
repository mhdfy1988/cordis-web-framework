import { createApp, defineComponent, h, ref } from 'vue';
import type { Component } from 'vue';
import { service } from 'cordis-web-framework';
import type { PluginHandle, RegisteredPlugin, Runtime } from 'cordis-web-framework';
import { assembleComposition, definePlugin, validateComposition } from 'cordis-web-framework/composition';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { createUiRegistry } from 'cordis-web-framework/ui';
import type { UiRegistry } from 'cordis-web-framework/ui';
import { createVueUi } from 'cordis-web-framework/presentation-vue/ui';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { z } from 'zod';
import { createDefaultLayoutPlugin, createDefaultThemePlugin, shellPositions } from '@cordis-web/default-ui';

// 非文档业务：同一个计数状态在布局撤销、替换、主题停止后必须保留。
export async function createWorkbench(target: HTMLElement) {
  const ui = createUiRegistry(); const key = service<UiRegistry>('example.ui'); const count = ref(0);
  const handles = new Map<string, PluginHandle>(); let actual!: Runtime;
  const layout = createDefaultLayoutPlugin({ ui: key, outlet: () => presenter.Outlet });
  const replacement = createDefaultLayoutPlugin({ ui: key, outlet: () => presenter.Outlet, id: 'example.alternative-layout' });
  const theme = createDefaultThemePlugin({ target });
  if (layout.plugin.prepare({ home: 'javascript:alert(1)' }).ok || layout.plugin.prepare({ variant: 'unknown' }).ok || theme.plugin.prepare({ initial: 'unknown' }).ok) throw new Error('非法配置不应通过预检');
  const views = new Map<string, Component>([...layout.views, ...replacement.views,
    ['example.counter', defineComponent({ setup: () => () => h('button', { onClick: () => count.value++ }, `计数 ${count.value}`) })],
    ['example.navigation', defineComponent({ setup: () => () => h('a', { href: '#/' }, '工作台') })],
    ['example.aside', defineComponent({ setup: () => () => h('p', '业务状态保留') })],
  ]);
  const presenter = createVueUi({ registry: ui, views, onError: error => { throw new Error(JSON.stringify(error)); } });
  const foundation = definePlugin({ manifest: { id: 'example.foundation', version: '1.0.0', apiVersion: '^1', requires: [], provides: [{ id: key.id, version: '1.0.0' }] },
    config: zodConfig(z.strictObject({}).prefault({})), setup(scope) { scope.provide(key, ui); scope.onDispose(() => ui.close()); } });
  const business = definePlugin({ manifest: { id: 'example.business', version: '1.0.0', apiVersion: '^1', requires: [{ id: key.id, range: '^1' }], provides: [] },
    config: zodConfig(z.strictObject({}).prefault({})), setup(scope) {
      for (const [target, view] of [[shellPositions.content, 'example.counter'], [shellPositions.navigation, 'example.navigation'], [shellPositions.aside, 'example.aside']]) {
        scope.onDispose(ui.inject(target, () => { const lease = ui.registerDynamic({ id: view, target, range: '^1', renderer: 'vue', view }); return () => lease.dispose(); }));
      }
    } });
  const modules = [foundation, business, layout.plugin, theme.plugin];
  const documentFor = (plugins: readonly RegisteredPlugin[], config?: unknown) => ({ formatVersion: 1 as const,
    plugins: plugins.map(plugin => ({ id: plugin.manifest.id, entry: plugin.manifest.id, version: plugin.manifest.version,
      ...(plugin === replacement.plugin ? { config } : plugin === layout.plugin ? { config: { mainId: target.id + '-content', navigationId: target.id + '-navigation' } } : {}) })), bindings: { [key.id]: foundation.manifest.id, 'ui.default-theme': theme.plugin.manifest.id } });
  const runtime = await assembleComposition(documentFor(modules), new Map(modules.map(plugin => [plugin.manifest.id, plugin])), {
    createRuntime() {
      actual = createCordisRuntime();
      // 仅记录公开 load 返回的句柄，不探测内部 Cordis 对象或扩充宿主 API。
      return { load(definition) { const handle = actual.load(definition); handles.set(definition.id, handle); return handle; },
        inspect: () => actual.inspect(), settle: () => actual.settle(), audit: ids => actual.audit(ids), subscribe: listener => actual.subscribe(listener), close: () => actual.close() };
    },
  });
  const app = createApp(presenter.Root); app.mount(target); const staleTheme = theme.current();
  return {
    toggleTheme() { theme.current().toggle(); },
    async stopTheme() { return (await handles.get(theme.plugin.manifest.id)!.stop()).state; },
    staleThemeRejected() { try { staleTheme.toggle(); return false; } catch { return true; } },
    async stopLayout() { return (await handles.get(layout.plugin.manifest.id)!.stop()).state; },
    async replaceLayout() {
      const config = { title: '通用工作台', variant: 'topbar', aside: false };
      // 替换前完整预检；低层 load 只用于这个已知单依赖的验收场景，不提供另一个通用装配器。
      const next = [foundation, business, replacement.plugin, theme.plugin];
      const check = validateComposition(documentFor(next, config), new Map(next.map(plugin => [plugin.manifest.id, plugin])));
      if (!check.ok) throw new Error(JSON.stringify(check.issues));
      const prepared = replacement.plugin.prepare(config); if (!prepared.ok) throw new Error(JSON.stringify(prepared.issues));
      const handle = runtime.load({ id: replacement.plugin.manifest.id, requires: [key], provides: [], setup: prepared.value });
      const state = await handle.settle(); if (state.state !== 'ready') throw new Error(JSON.stringify(state));
      return state.state;
    },
    snapshot: () => ({ ui: ui.inspect(), runtime: runtime.inspect(), count: count.value }),
    async close() { app.unmount(); return await runtime.close(); },
  };
}

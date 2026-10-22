import type { Component } from 'vue';
import * as vue from 'vue';
import { createDefaultLayoutPlugin, createDefaultThemePlugin } from '@cordis-web/default-ui';
import { createUiRegistry } from 'cordis-web-framework/ui';
import { createCommandRegistry } from 'cordis-web-framework/commands';
import { createVueUi } from 'cordis-web-framework/presentation-vue/ui';
import { createVueNavigation } from 'cordis-web-framework/presentation-vue/routing';
import type { VueNavigation } from 'cordis-web-framework/presentation-vue/routing';
import { startVueHost } from 'cordis-web-framework/presentation-vue';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import type { HostHandle } from 'cordis-web-framework/contracts/host';
import { manifestSchema } from './shared/documents.ts';
import { createDocumentSession } from './services/documents.ts';
import { createSearch } from './services/search.ts';
import { createClipboard } from './services/clipboard.ts';
import { createModules } from './plugins/modules.ts';
import * as keys from './services/contracts.ts';
import { outletKey, stopKey } from './components/context.ts';
import DocumentContent from './components/DocumentContent.vue';
import DocumentNavigation from './components/DocumentNavigation.vue';
import DocumentPage from './components/DocumentPage.vue';
import PageOutline from './components/PageOutline.vue';
import SearchDialog from './components/SearchDialog.vue';
import SearchButton from './components/SearchButton.vue';
import ThemeButton from './components/ThemeButton.vue';
import { createRestartableViews } from './services/restartable-views.ts';
import { createPluginController } from './management/controller.ts';
import { pluginControllerKey } from './management/context.ts';
import ManagementHost from './management/ManagementHost.vue';
import PluginManager from './management/PluginManager.vue';
import { createSettingsStore } from './management/settings.ts';
import { createBrowserPluginStore, createBrowserPluginLoader, createBrowserPackageRepository } from 'cordis-web-framework/hosts/browser/plugins';

export async function startDocumentation(target: HTMLElement, base: string, report: (value: unknown) => void): Promise<HostHandle> {
  const response = await fetch(base + 'manifest.json'); if (!response.ok) throw new Error('文档目录读取失败');
  const manifest = manifestSchema.parse(await response.json()); if (manifest.base !== base) throw new Error('站点基础路径与文档产物不一致');
  const ui = createUiRegistry(); const commands = createCommandRegistry(); const session = createDocumentSession(base);
  const documents: keys.Documents = { manifest, session }; const clipboard = createClipboard(); const access = createRestartableViews();
  let navigation: VueNavigation | undefined; let host: HostHandle | undefined;
  const layout = createDefaultLayoutPlugin({ ui: keys.uiService, outlet: () => presenter.Outlet });
  const theme = createDefaultThemePlugin({ target, storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) }, storageKey: 'docs-theme' });
  const presenter = createVueUi({ registry: ui, views: new Map<string, Component>([
    ...layout.views, ['docs.management', PluginManager], ['docs.content-view', DocumentContent], ['docs.navigation', DocumentNavigation], ['docs.page', DocumentPage], ['docs.outline', PageOutline], ['docs.search', SearchDialog], ['docs.search-button', SearchButton], ['docs.theme-button', ThemeButton],
  ]), onError: detail => { console.error('文档呈现失败', detail); } });
  const modules = createModules({ target, ui, commands, documents, clipboard, createSearch: () => createSearch(base), acceptSearch: access.acceptSearch, acceptPreferences: access.acceptPreferences,
    createNavigation: () => createVueNavigation({ ui, target: 'docs.body', history: 'hash', onError: () => console.error('文档导航失败') }),
    acceptNavigation: value => { navigation = value; } });
  modules.push(layout.plugin, theme.plugin);
  const bindings = { 'docs.ui': 'docs.foundation', 'docs.commands': 'docs.foundation', 'docs.navigation': 'docs.foundation', 'docs.documents': 'docs.content',
    'docs.search': 'docs.search', 'ui.default-theme': 'ui.default-theme', 'docs.clipboard': 'docs.clipboard' };
  const document = { formatVersion: 1 as const, plugins: modules.map(module => ({ id: module.manifest.id, version: module.manifest.version, entry: module.manifest.id,
      ...(module.manifest.id === 'ui.default-layout' ? { config: { title: 'Cordis Web Framework', menuLabel: '章节', navigationLabel: '章节导航', asideLabel: '本页目录', mainId: 'main-document', navigationId: 'chapter-navigation' } } : {}) })), bindings };
  const catalog = new Map(modules.map(module => [module.manifest.id, module]));
  const settingsStore = createSettingsStore({ getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) }, 'cordis-docs:' + base + ':plugins:v1');
  const controller = createPluginController({ document, catalog, legacySettings: settingsStore.read,
    store: createBrowserPluginStore('cordis-docs:' + base + ':plugins:v2'), loader: createBrowserPluginLoader(), packages: createBrowserPackageRepository({ shared: { vue } }) });
  host = await startVueHost({ target, component: ManagementHost, props: runtime => { controller.attach(runtime.management!); return { root: presenter.Root }; },
    createRuntime: createCordisRuntime, requiredPluginIds: controller.requiredPluginIds, management: controller.management,
    document: { formatVersion: 1, plugins: [], bindings: {} }, catalog: new Map(), onError: error => console.error('文档宿主错误', error),
    configure(app) {
      if (!navigation) throw new Error('文档基础插件未就绪'); navigation.install(app);
      app.provide(keys.documentsKey, documents); app.provide(keys.navigationKey, navigation); app.provide(keys.commandsKey, commands);
      app.provide(keys.searchKey, access.search); app.provide(keys.preferencesKey, access.preferences); app.provide(keys.clipboardKey, clipboard);
      app.provide(pluginControllerKey, controller);
      app.provide(outletKey, presenter.Outlet);
      app.provide(stopKey, async () => {
        const result = await host!.stop(); report({ shutdown: result, ui: ui.inspect(), commands: commands.inspect(), navigation: navigation!.inspect() });
      });
    },
  });
  await navigation!.ready(); if (navigation!.current() !== 'plugin-manager') await session.select(manifest.pages.find(page => page.id === navigation!.current())); return host;
}

import { shellPositions } from '@cordis-web/default-ui';
import { definePlugin } from 'cordis-web-framework/composition';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { z } from 'zod';
import { bindCommandShortcuts } from 'cordis-web-framework/presentation-vue/controls';
import type { UiRegistry } from 'cordis-web-framework/ui';
import type { CommandRegistry } from 'cordis-web-framework/commands';
import type { VueNavigation } from 'cordis-web-framework/presentation-vue/routing';
import { uiService, commandService, navigationService, documentService, searchService, preferencesService, clipboardService } from '../services/contracts.ts';
import type { Documents, Search, Preferences, Clipboard } from '../services/contracts.ts';

const config = zodConfig(z.strictObject({}).default({}));
const manifest = (id: string, requires: readonly { id: string }[], provides: readonly { id: string }[] = []) => ({ id, version: '1.0.0', apiVersion: '^1',
  requires: requires.map(key => ({ id: key.id, range: '^1' })), provides: provides.map(key => ({ id: key.id, version: '1.0.0' })) });
export interface ModuleInputs {
  target: HTMLElement; ui: UiRegistry; commands: CommandRegistry; documents: Documents; clipboard: Clipboard;
  createSearch(): Search; acceptSearch(value: Search): void; acceptPreferences(value: Preferences): void;
  createNavigation(): VueNavigation; acceptNavigation(value: VueNavigation): void;
}
export function createModules(input: ModuleInputs) {
  const foundation = definePlugin({ manifest: manifest('docs.foundation', [], [uiService, commandService, navigationService]), config, setup(scope) {
    const navigation = input.createNavigation(); input.acceptNavigation(navigation);
    scope.onDispose(async () => { navigation.close(); await input.commands.close(); input.ui.close(); });
    scope.provide(uiService, input.ui); scope.provide(commandService, input.commands); scope.provide(navigationService, navigation);
  } });
  const documents = definePlugin({ manifest: manifest('docs.content', [], [documentService]), config, setup(scope) {
    scope.onDispose(() => input.documents.session.close()); scope.provide(documentService, input.documents);
  } });
  const clipboard = definePlugin({ manifest: manifest('docs.clipboard', [], [clipboardService]), config, setup(scope) {
    scope.onDispose(() => input.clipboard.close()); scope.provide(clipboardService, input.clipboard);
  } });
  const contentView = definePlugin({ manifest: manifest('docs.content-view', [uiService, documentService]), config, setup(scope) {
    const registry = scope.get(uiService);
    scope.onDispose(registry.inject(shellPositions.content, () => {
      const lease = registry.registerDynamic({ id: 'docs.content-view', target: shellPositions.content, range: '^1', renderer: 'vue', view: 'docs.content-view', children: [
        { name: 'docs.body', kind: 'keyed', scope: 'root', version: '1.0.0' },
      ] }); return () => lease.dispose();
    }));
  } });
  const navigation = definePlugin({ manifest: manifest('docs.navigation', [uiService, navigationService, documentService, clipboardService]), config, setup(scope) {
    const nav = scope.get(navigationService); const docs = scope.get(documentService); const registry = scope.get(uiService);
    for (const page of docs.manifest.pages) {
      scope.onDispose(nav.register({ id: page.id, path: page.route, view: 'docs.page' }));
      scope.onDispose(nav.registerNavigation({ id: page.id, routeId: page.id, label: page.title }));
    }
    const update = () => { if (nav.current() !== 'plugin-manager') void docs.session.select(docs.manifest.pages.find(page => page.id === nav.current())); };
    scope.onDispose(nav.subscribe(update));
    for (const [target, view] of [[shellPositions.navigation, 'docs.navigation']] as const) {
      scope.onDispose(registry.inject(target, () => { const lease = registry.registerDynamic({ id: view, target, range: '^1', renderer: 'vue', view }); return () => lease.dispose(); }));
    }
  } });
  const outline = definePlugin({ manifest: manifest('docs.outline', [uiService, documentService]), config, setup(scope) {
    const registry = scope.get(uiService);
    scope.onDispose(registry.inject(shellPositions.aside, () => { const lease = registry.registerDynamic({ id: 'docs.outline', target: shellPositions.aside, range: '^1', renderer: 'vue', view: 'docs.outline' }); return () => lease.dispose(); }));
  } });
  const management = definePlugin({ manifest: manifest('docs.management', [navigationService]), config, setup(scope) {
    const nav = scope.get(navigationService);
    scope.onDispose(nav.register({ id: 'plugin-manager', path: '/plugins', view: 'docs.management' }));
  } });
  const theme = definePlugin({ manifest: manifest('docs.theme-control', [uiService, commandService, preferencesService]), config, setup(scope) {
    const preferences = scope.get(preferencesService);
    input.acceptPreferences(preferences);
    scope.onDispose(scope.get(commandService).register({ id: 'docs.theme', label: '切换深浅色主题', run() { preferences.toggle(); } }));
    const registry = scope.get(uiService);
    scope.onDispose(registry.inject(shellPositions.header, () => { const lease = registry.registerDynamic({ id: 'docs.theme-control', target: shellPositions.header, range: '^1', renderer: 'vue', view: 'docs.theme-button', order: 20 }); return () => lease.dispose(); }));
  } });
  const search = definePlugin({ manifest: manifest('docs.search', [uiService, commandService, documentService], [searchService]), config, setup(scope) {
    const search = input.createSearch(); input.acceptSearch(search);
    scope.onDispose(() => search.dispose()); scope.provide(searchService, search);
    scope.onDispose(scope.get(commandService).register({ id: 'docs.search', label: '搜索文档', shortcut: { key: 'k', mod: true, allowInput: true }, async run() { await search.show(); } }));
    const registry = scope.get(uiService);
    scope.onDispose(registry.inject(shellPositions.overlays, () => { const lease = registry.registerDynamic({ id: 'docs.search', target: shellPositions.overlays, range: '^1', renderer: 'vue', view: 'docs.search' }); return () => lease.dispose(); }));
    scope.onDispose(bindCommandShortcuts(input.target, scope.get(commandService), () => ({})));
  } });
  const header = definePlugin({ manifest: manifest('docs.header', [uiService, commandService, searchService]), config, setup(scope) {
    const registry = scope.get(uiService);
    scope.onDispose(registry.inject(shellPositions.header, () => { const lease = registry.registerDynamic({ id: 'docs.header', target: shellPositions.header, range: '^1', renderer: 'vue', view: 'docs.search-button', order: 10 }); return () => lease.dispose(); }));
  } });
  return [foundation, documents, clipboard, contentView, navigation, outline, management, theme, search, header];
}

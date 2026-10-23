import { readonly, ref, shallowRef } from 'vue';
import type { CompositionDocument, PluginCatalog } from 'cordis-web-framework';
import type { PluginManager, PluginManagerSnapshot, PluginModuleLoader, PluginStore } from 'cordis-web-framework/management';
import type { PluginPackageRepository } from 'cordis-web-framework/management';
import { optionalGroups } from './settings.ts';
import type { PluginSettings } from './settings.ts';
export { optionalGroups } from './settings.ts';

/** 呈现适配只映射应用分组、布局选择和反馈；所有管理规则由框架执行。 */
export function createPluginController(input: { document: CompositionDocument; catalog: PluginCatalog;
  store: PluginStore; loader: PluginModuleLoader; packages?: PluginPackageRepository; legacySettings?: () => PluginSettings }) {
  const snapshot = shallowRef<PluginManagerSnapshot>(); const busy = ref(''); const error = ref('');
  const variant = ref<'sidebar' | 'topbar'>('sidebar');
  let manager: PluginManager | undefined;
  const optional = new Set(Object.values(optionalGroups).flat());
  const requiredPluginIds = input.document.plugins.map(entry => entry.id).filter(id => !optional.has(id));
  const builtins = input.document.plugins.map(entry => {
    const plugin = input.catalog.get(entry.entry); if (!plugin) throw new Error('内置插件目录缺失：' + entry.id);
    const bindings = Object.fromEntries(plugin.manifest.requires.map(item => [item.id, input.document.bindings[item.id]]));
    return { plugin, required: requiredPluginIds.includes(entry.id), config: entry.config ?? {}, bindings };
  });
  function update(value: PluginManagerSnapshot) {
    snapshot.value = value;
    const configuration = value.plugins.some(item => item.id === 'ui.default-layout')
      ? manager?.configuration('ui.default-layout').config as { variant?: 'sidebar' | 'topbar' } : undefined;
    variant.value = configuration?.variant ?? 'sidebar';
  }
  async function execute(id: string, operation: (target: PluginManager) => Promise<unknown>) {
    if (!manager || snapshot.value?.closed) throw new Error('插件管理已关闭或尚未就绪');
    if (busy.value) return; busy.value = id; error.value = '';
    try { await operation(manager); } catch (problem) { error.value = problem instanceof Error ? problem.message : String(problem); }
    finally { update(manager.inspect()); busy.value = ''; }
  }
  return {
    snapshot: readonly(snapshot), busy: readonly(busy), error: readonly(error), variant: readonly(variant), requiredPluginIds,
    reportError(message: string) { error.value = message; },
    get manager() { return manager; },
    management: { store: input.store, loader: input.loader, packages: input.packages, builtins, initialize() {
      // 只有框架确认新库未初始化时才读取旧设置；成功提交后旧键不再参与管理。
      const settings = input.legacySettings?.() ?? { formatVersion: 1, disabled: [], variant: 'sidebar' };
      const disabled = new Set(settings.disabled.flatMap(id => optionalGroups[id]));
      return builtins.map(item => ({ id: item.plugin.manifest.id, enabled: !disabled.has(item.plugin.manifest.id),
        config: item.plugin.manifest.id === 'ui.default-layout' ? { ...item.config as object, variant: settings.variant } : item.config,
        bindings: item.bindings }));
    } },
    attach(value: PluginManager) {
      if (manager) throw new Error('呈现适配不可重复连接'); manager = value;
      update(manager.inspect()); manager.subscribe(update);
    },
    get modules() { return snapshot.value?.plugins.map(item => item.manifest) ?? builtins.map(item => item.plugin.manifest); },
    current(id: string) { return snapshot.value?.plugins.find(item => item.id === id)?.runtime; },
    state(id: string) { return snapshot.value?.plugins.find(item => item.id === id)?.state; },
    enabled(id: string) { return snapshot.value?.plugins.find(item => item.id === id)?.enabled ?? false; },
    async toggle(id: string) {
      const group = optionalGroups[id];
      if (!group) { error.value = '基础插件不可在此停用'; return; }
      await execute(id, async target => {
        const enabled = target.inspect().plugins.find(item => item.id === id)?.enabled;
        for (const member of enabled ? [...group].reverse() : group) {
          if (enabled) await target.disable(member); else await target.enable(member);
        }
      });
    },
    async changeLayout(next: 'sidebar' | 'topbar') {
      await execute('ui.default-layout', async target => {
        const settings = target.configuration('ui.default-layout');
        await target.configure('ui.default-layout', { config: { ...settings.config as object, variant: next }, bindings: settings.bindings,
          restart: true, expectedRevision: target.inspect().revision });
      });
    },
  };
}
export type PluginController = ReturnType<typeof createPluginController>;

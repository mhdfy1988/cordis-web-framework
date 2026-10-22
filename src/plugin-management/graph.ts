import type { Installation } from '../contracts/management.ts';
import type { PluginManifest } from '../contracts/composition.ts';
import { checkGraph } from '../plugin-composition/check-graph.ts';

/** 复用已有静态图检查；等待未启用的显式提供者可表达，不另造依赖激活引擎。 */
export function validateManagedGraph(records: readonly Installation[], manifests: ReadonlyMap<string, PluginManifest>) {
  const enabled = records.filter(item => item.enabled);
  const active = new Set(enabled.map(item => item.id));
  const bindings: Record<string, string> = Object.create(null);
  for (const item of enabled) {
    const manifest = manifests.get(item.id)!;
    for (const dependency of manifest.requires) {
      const provider = item.bindings[dependency.id];
      if (!provider) throw new Error(`缺少显式绑定：${item.id} → ${dependency.id}`);
      const target = manifests.get(provider);
      if (target && !target.provides.some(service => service.id === dependency.id)) throw new Error(`绑定目标未提供服务：${dependency.id}`);
      if (bindings[dependency.id] && bindings[dependency.id] !== provider) throw new Error(`服务绑定冲突：${dependency.id}`);
      bindings[dependency.id] = provider;
    }
  }
  const presentBindings = Object.fromEntries(Object.entries(bindings).filter(([, id]) => active.has(id)));
  const issues = checkGraph(enabled.map(item => manifests.get(item.id)!), presentBindings).filter(issue => {
    return !(issue.code === 'missing-binding' && bindings[issue.serviceId!] && !active.has(bindings[issue.serviceId!]));
  });
  // 声明了另一个提供者但当前已有同服务时，也不能让 Cordis 按偶然注册顺序绑定。
  for (const manifest of enabled.map(item => manifests.get(item.id)!)) for (const provided of manifest.provides) {
    if (bindings[provided.id] && bindings[provided.id] !== manifest.id) throw new Error(`实际提供者与绑定冲突：${provided.id}`);
  }
  if (issues.length) throw new Error(issues.map(issue => `${issue.code}: ${issue.message}`).join('；'));
}

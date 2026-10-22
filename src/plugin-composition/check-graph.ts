import type { CompositionIssue, PluginManifest } from '../contracts/composition.ts';
import { matchesVersion } from '../version-semver/index.ts';

/** 只做装配前静态校验，不调度激活、不替代 Cordis 的运行时依赖管理。 */
export function checkGraph(plugins: readonly PluginManifest[], bindings: Readonly<Record<string, string>>) {
  const issues: CompositionIssue[] = [];
  const providers = new Map<string, { plugin: PluginManifest; version: string }>();
  const dependencies = new Map(plugins.map(plugin => [plugin.id, new Set<string>()]));
  for (const plugin of plugins) {
    for (const service of plugin.provides) {
      if (providers.has(service.id)) issues.push({ code: 'duplicate-service', pluginId: plugin.id,
        serviceId: service.id, path: ['plugins', plugin.id, 'provides', service.id], message: `服务有重复提供声明：${service.id}` });
      else providers.set(service.id, { plugin, version: service.version });
    }
    const required = new Set<string>();
    for (const dependency of plugin.requires) {
      if (required.has(dependency.id)) issues.push({ code: 'duplicate-requirement', pluginId: plugin.id,
        serviceId: dependency.id, path: ['plugins', plugin.id, 'requires', dependency.id], message: '消费服务声明重复' });
      required.add(dependency.id);
    }
  }
  for (const [id, pluginId] of Object.entries(bindings)) {
    if (providers.get(id)?.plugin.id !== pluginId) issues.push({ code: 'invalid-binding', serviceId: id,
      pluginId, path: ['bindings', id], message: '绑定目标未装载或没有提供该服务' });
  }
  for (const plugin of plugins) {
    for (const dependency of plugin.requires) {
      const provider = providers.get(dependency.id);
      if (!Object.hasOwn(bindings, dependency.id)) {
        issues.push({ code: 'missing-binding', pluginId: plugin.id, serviceId: dependency.id,
          path: ['bindings', dependency.id], message: '必需服务缺少显式提供者绑定' });
        continue;
      }
      if (!provider || provider.plugin.id !== bindings[dependency.id]) continue;
      if (!matchesVersion(provider.version, dependency.range)) issues.push({ code: 'service-incompatible',
        pluginId: plugin.id, serviceId: dependency.id, path: ['plugins', plugin.id, 'requires', dependency.id],
        message: `服务版本 ${provider.version} 不满足 ${dependency.range}` });
      dependencies.get(plugin.id)!.add(provider.plugin.id);
    }
  }
  const visited = new Set<string>();
  const active: string[] = [];
  function visit(id: string) {
    const start = active.indexOf(id);
    if (start !== -1) {
      issues.push({ code: 'dependency-cycle', pluginId: id, path: ['plugins', id, 'requires'],
        message: `依赖环：${[...active.slice(start), id].join(' → ')}` });
      return;
    }
    if (visited.has(id)) return;
    active.push(id);
    for (const dependency of dependencies.get(id)!) visit(dependency);
    active.pop();
    visited.add(id);
  }
  for (const plugin of plugins) visit(plugin.id);
  return issues;
}

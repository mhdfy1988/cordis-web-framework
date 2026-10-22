import { PLUGIN_API_VERSION } from '../contracts/composition.ts';
import type { CompositionIssue, CompositionPlan, PluginCatalog, PreparedPlugin, HostEnvironment } from '../contracts/composition.ts';
import { documentValidator, manifestValidator, hostEnvironmentValidator } from '../validation-zod/index.ts';
import { isRange, isVersion, matchesVersion } from '../version-semver/index.ts';
import { checkGraph } from './check-graph.ts';
import { freezeData } from '../data/immutable.ts';

export function preflight(document: unknown, catalog: PluginCatalog, apiVersion = PLUGIN_API_VERSION, environment?: HostEnvironment):
  { ok: true; plan: CompositionPlan; prepared: PreparedPlugin[] } | { ok: false; issues: readonly CompositionIssue[] } {
  const issues: CompositionIssue[] = [];
  const reject = () => ({ ok: false as const, issues: freezeData(issues) });
  if (environment && !hostEnvironmentValidator.validate(environment).ok) {
    issues.push({ code: 'host-incompatible', path: ['host'], message: '宿主平台或能力格式无效' });
    return reject();
  }
  if (!isVersion(apiVersion)) {
    issues.push({ code: 'invalid-host-version', path: ['host', 'apiVersion'], message: '宿主 API 必须是精确语义版本' });
    return reject();
  }
  let input = document;
  if (typeof document === 'string') {
    try { input = JSON.parse(document); } catch {
      issues.push({ code: 'invalid-document', path: [], message: '装配文档不是合法 JSON' });
      return reject();
    }
  }
  const parsed = documentValidator.validate(input);
  if (!parsed.ok) {
    issues.push(...parsed.issues.map(issue => ({ ...issue, code: 'invalid-document' as const })));
    return reject();
  }
  const prepared: PreparedPlugin[] = [];
  const ids = new Set<string>();
  for (const [index, entry] of parsed.value.plugins.entries()) {
    const path = ['plugins', index] as const;
    if (ids.has(entry.id)) {
      issues.push({ code: 'duplicate-plugin', pluginId: entry.id, path: [...path, 'id'], message: '插件身份重复' });
      continue;
    }
    ids.add(entry.id);
    const module = catalog.get(entry.entry);
    if (!module) {
      issues.push({ code: 'module-not-found', pluginId: entry.id, path: [...path, 'entry'], message: '入口不在可信模块目录中' });
      continue;
    }
    const metadata = manifestValidator.validate(module.manifest);
    if (!metadata.ok) {
      issues.push(...metadata.issues.map(issue => ({ ...issue, code: 'invalid-manifest' as const,
        pluginId: entry.id, path: [...path, 'manifest', ...issue.path] })));
      continue;
    }
    const manifest = metadata.value;
    const before = issues.length;
    if (manifest.host && (!environment || !manifest.host.platforms.includes(environment.platform)
      || manifest.host.capabilities.some(capability => !environment.capabilities.includes(capability)))) {
      issues.push({ code: 'host-incompatible', pluginId: entry.id, path: [...path, 'manifest', 'host'],
        message: '宿主平台或能力不满足插件声明' });
    }
    if (manifest.id !== entry.id) issues.push({ code: 'identity-mismatch', pluginId: entry.id,
      path: [...path, 'id'], message: '装配身份与模块清单不一致' });
    if (!isVersion(entry.version) || !isVersion(manifest.version) || entry.version !== manifest.version) {
      issues.push({ code: 'implementation-mismatch', pluginId: entry.id,
        path: [...path, 'version'], message: '实现版本必须为精确语义版本并与可信模块一致' });
    }
    if (!isRange(manifest.apiVersion) || !matchesVersion(apiVersion, manifest.apiVersion)) {
      issues.push({ code: 'host-incompatible', pluginId: entry.id,
        path: [...path, 'manifest', 'apiVersion'], message: `宿主 API ${apiVersion} 不满足 ${manifest.apiVersion}` });
    }
    for (const [field, items] of [['requires', manifest.requires], ['provides', manifest.provides]] as const) {
      for (const [position, service] of items.entries()) {
        const valid = 'range' in service ? isRange(service.range) : isVersion(service.version);
        if (!valid) issues.push({ code: 'invalid-manifest', pluginId: entry.id, serviceId: service.id,
          path: [...path, 'manifest', field, position], message: '服务版本或范围不是合法语义版本声明' });
      }
    }
    if (issues.length !== before) continue;
    try {
      const configuration = module.prepare(entry.config);
      if (!configuration.ok) {
        issues.push(...configuration.issues.map(issue => ({ ...issue, code: 'config-invalid' as const,
          pluginId: entry.id, path: [...path, 'config', ...issue.path] })));
        continue;
      }
      if (typeof configuration.value !== 'function') throw new TypeError('模块配置入口没有返回激活函数');
      prepared.push({ manifest, definition: Object.freeze({ id: manifest.id,
        requires: manifest.requires.map(service => Object.freeze({ id: service.id })),
        provides: manifest.provides.map(service => Object.freeze({ id: service.id })), setup: configuration.value }) });
    } catch (error) {
      issues.push({ code: 'config-invalid', pluginId: entry.id, path: [...path, 'config'],
        message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (issues.length) return reject();
  issues.push(...checkGraph(prepared.map(item => item.manifest), parsed.value.bindings));
  if (issues.length) return reject();
  return { ok: true, prepared, plan: freezeData({ plugins: prepared.map(item => item.manifest), bindings: parsed.value.bindings }) };
}

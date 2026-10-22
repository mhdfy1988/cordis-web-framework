import type { PluginArtifact } from '../contracts/management.ts';
import type { HostEnvironment, PluginManifest } from '../contracts/composition.ts';
import { artifactValidator } from '../validation-zod/management.ts';
import { isVersion, isRange, matchesVersion } from '../version-semver/index.ts';
import { PLUGIN_API_VERSION } from '../contracts/composition.ts';
import { freezeData } from '../data/immutable.ts';

export function canonicalJson(input: unknown): string {
  if (Array.isArray(input)) return '[' + input.map(canonicalJson).join(',') + ']';
  if (input && typeof input === 'object') return '{' + Object.keys(input).sort().map(key =>
    JSON.stringify(key) + ':' + canonicalJson((input as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(input);
}
export async function artifactIntegrity(input: Omit<PluginArtifact, 'integrity'>): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(input));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
}
export async function validateArtifact(input: unknown, environment?: HostEnvironment): Promise<PluginArtifact> {
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 4_194_304) throw new Error('插件包超过 4 MiB');
  const parsed = artifactValidator.validate(input);
  if (!parsed.ok) throw new Error('插件包格式无效：' + parsed.issues.map(issue => issue.message).join('；'));
  const { integrity, ...content } = parsed.value;
  assertManifestCompatibility(content.manifest, environment);
  if (environment && !content.entries[environment.platform]) throw new Error('插件不支持当前宿主');
  if (integrity !== await artifactIntegrity(content)) throw new Error('插件包完整性不匹配');
  return freezeData(parsed.value);
}
export function assertManifestCompatibility(m: PluginManifest, environment?: HostEnvironment) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(m.id) || !isVersion(m.version) || !isRange(m.apiVersion)
    || !matchesVersion(PLUGIN_API_VERSION, m.apiVersion)
    || m.requires.some(item => !isRange(item.range)) || m.provides.some(item => !isVersion(item.version))) throw new Error('插件版本或身份不兼容');
  if (environment && m.host && (!m.host.platforms.includes(environment.platform)
    || m.host.capabilities.some(item => !environment.capabilities.includes(item)))) throw new Error('插件不支持当前宿主');
}

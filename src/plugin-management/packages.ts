import type { BrowserPackage, PackageArtifact, PackageDeclaration } from '../contracts/packages.ts';
import type { HostEnvironment, RegisteredPlugin } from '../contracts/composition.ts';
import { browserPackageSchema, packageArtifactSchema, packageDeclarationSchema } from '../validation-zod/packages.ts';
import { canonicalJson, assertManifestCompatibility } from './artifact.ts';
import { freezeData } from '../data/immutable.ts';

export async function packageDigest(input: unknown): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(input)));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function validatePackageDeclaration(input: unknown, environment?: HostEnvironment): PackageDeclaration {
  const parsed = packageDeclarationSchema.safeParse(input);
  if (!parsed.success) throw new Error('标准包声明无效：' + parsed.error.message);
  assertManifestCompatibility(parsed.data.manifest, environment);
  if (environment && !parsed.data.entries[environment.platform]) throw new Error('标准包缺少当前平台入口');
  return freezeData(parsed.data);
}
export function validatePackageArtifact(input: unknown, environment?: HostEnvironment): PackageArtifact {
  const parsed = packageArtifactSchema.safeParse(input);
  if (!parsed.success) throw new Error('标准包记录格式无效');
  assertManifestCompatibility(parsed.data.manifest, environment);
  if (parsed.data.manifest.version !== parsed.data.version) throw new Error('标准包版本不一致');
  return freezeData(parsed.data);
}
export async function validateBrowserPackage(input: unknown): Promise<BrowserPackage> {
  if (new TextEncoder().encode(JSON.stringify(input)).length > 8_388_608) throw new Error('浏览器包超过 8 MiB');
  const parsed = browserPackageSchema.safeParse(input);
  if (!parsed.success) throw new Error('浏览器交付数据格式无效');
  const { integrity, ...body } = parsed.data;
  validatePackageDeclaration(body.declaration, { platform: 'browser', capabilities: body.declaration.manifest.host?.capabilities ?? [] });
  if (!body.declaration.entries.browser || integrity !== await packageDigest(body)) throw new Error('浏览器包入口或完整性无效');
  if (Object.keys(body.assets).sort().join() !== Object.keys(body.declaration.assets).sort().join()) throw new Error('浏览器资源不完整');
  return freezeData(parsed.data);
}
export function instantiatePackage(module: unknown, artifact: PackageArtifact,
  assets: Readonly<Record<string, string>>, shared: Readonly<Record<string, unknown>>, release: () => void) {
  const factory = (module as { default?: unknown })?.default;
  if (typeof factory !== 'function') throw new Error('标准包默认导出必须为工厂');
  const plugin = factory(artifact.manifest, Object.freeze({ assets: Object.freeze(assets), shared: Object.freeze({ ...shared }) })) as RegisteredPlugin;
  if (!plugin || typeof plugin.prepare !== 'function' || canonicalJson(plugin.manifest) !== canonicalJson(artifact.manifest)) throw new Error('标准包工厂清单不一致');
  return { plugin, release };
}

import type { BrowserPackage, PackageArtifact, PluginPackageRepository } from '../../contracts/packages.ts';
import { instantiatePackage, validateBrowserPackage, validatePackageArtifact, validatePackageDeclaration } from '../../plugin-management/packages.ts';
import { canonicalJson } from '../../plugin-management/artifact.ts';

export function createBrowserPackageRepository(options: { readonly shared?: Readonly<Record<string, unknown>> } = {}): PluginPackageRepository {
  const shared = Object.freeze({ ...options.shared }); const modules = new Map<string, unknown>();
  const releases = new Set<() => void>(); let active = false;
  async function validate(artifact: PackageArtifact, environment?: Parameters<PluginPackageRepository['validate']>[1]): Promise<BrowserPackage> {
    if (!active) throw new Error('浏览器包仓库尚未打开');
    validatePackageArtifact(artifact, environment);
    const data = await validateBrowserPackage(artifact.browser);
    if (artifact.key !== data.integrity || artifact.integrity !== data.integrity || artifact.name !== data.name
      || canonicalJson(artifact.manifest) !== canonicalJson(data.declaration.manifest)) throw new Error('浏览器包引用不一致');
    validatePackageDeclaration(data.declaration, environment);
    for (const name of data.declaration.shared) if (!Object.hasOwn(shared, name)) throw new Error(`宿主缺少共享模块：${name}`);
    return data;
  }
  return {
    async recover() { if (active) throw new Error('浏览器包仓库已打开'); active = true; },
    async stage(input, settings) {
      if (settings.acceptTrustedCode !== true || !active) throw new Error('需要可信代码确认');
      settings.signal?.throwIfAborted(); settings.onProgress?.('validating');
      const data = await validateBrowserPackage(input);
      const artifact = validatePackageArtifact({ kind: 'npm', key: data.integrity, name: data.name,
        version: data.declaration.manifest.version, manifest: data.declaration.manifest,
        integrity: data.integrity, source: 'browser-delivery', browser: data });
      await validate(artifact, { platform: 'browser', capabilities: data.declaration.manifest.host?.capabilities ?? [] });
      settings.signal?.throwIfAborted(); settings.onProgress?.('stored'); return artifact;
    },
    async validate(artifact, environment) { await validate(artifact, environment); },
    async load(artifact, environment) {
      const data = await validate(artifact, environment);
      let module = modules.get(artifact.integrity);
      if (!module) {
        if (modules.size >= 128) throw new Error('浏览器代码缓存已达上限，请关闭后重开');
        const url = URL.createObjectURL(new Blob([data.code], { type: 'text/javascript' }));
        try { module = await import(/* @vite-ignore */ url); modules.set(artifact.integrity, module); }
        finally { URL.revokeObjectURL(url); }
      }
      const urls: Record<string, string> = {};
      const release = () => { for (const url of Object.values(urls)) URL.revokeObjectURL(url); releases.delete(release); };
      try {
        for (const [id, asset] of Object.entries(data.assets)) {
          const bytes = Uint8Array.from(atob(asset.base64), value => value.charCodeAt(0));
          urls[id] = URL.createObjectURL(new Blob([bytes], { type: asset.type }));
        }
        releases.add(release); return instantiatePackage(module, artifact, urls, Object.fromEntries(data.declaration.shared.map(name => [name, shared[name]])), release);
      } catch (error) { release(); throw error; }
    },
    async remove() { /* 包数据由同一安装文档持久保存，移除记录即移除保存内容。 */ },
    async close() { for (const release of releases) release(); modules.clear(); active = false; },
  };
}

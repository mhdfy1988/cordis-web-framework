import { mkdir, mkdtemp, readFile, writeFile, rm, open, readdir } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PackageArtifact, PluginPackageRepository, BrowserPackage } from '../../contracts/packages.ts';
import { validatePackageDeclaration, validatePackageArtifact, packageDigest, instantiatePackage } from '../../plugin-management/packages.ts';
import { canonicalJson } from '../../plugin-management/artifact.ts';
import { matchesVersion } from '../../version-semver/index.ts';
import { inside, packageFile, treeDigest, assetType } from './package-files.ts';
import { runPackageCommand, type NpmRunnerOptions } from './package-command.ts';

export type NodePackageSource = { readonly type: 'file'; readonly path: string }
  | { readonly type: 'registry'; readonly name: string; readonly version: string; readonly registry?: string };
export interface NodePackageRepositoryOptions extends NpmRunnerOptions {
  readonly directory: string;
  readonly shared?: Readonly<Record<string, unknown>>;
}
export function createNodePackageRepository(options: NodePackageRepositoryOptions): PluginPackageRepository & {
  exportBrowser(artifact: PackageArtifact): Promise<BrowserPackage>;
} {
  if (!isAbsolute(options.directory)) throw new Error('插件包库必须为绝对路径');
  const root = resolve(options.directory); const shared = Object.freeze({ ...options.shared });
  let lock: Awaited<ReturnType<typeof open>> | undefined; let active = false;
  const folder = (artifact: PackageArtifact) => inside(root, validatePackageArtifact(artifact).key);
  async function metadata(artifact: PackageArtifact) {
    const directory = folder(artifact);
    const lockFile = JSON.parse(await readFile(join(directory, 'package-lock.json'), 'utf8'));
    const names = Object.keys(lockFile.packages?.['']?.dependencies ?? {});
    if (names.length !== 1 || names[0] !== artifact.name) throw new Error('包锁身份无效');
    const packageRoot = inside(directory, 'node_modules/' + artifact.name);
    const json = JSON.parse(await readFile(await packageFile(packageRoot, 'package.json'), 'utf8'));
    const declaration = validatePackageDeclaration(json.cordisWeb);
    if (json.type !== 'module' || json.name !== artifact.name || json.version !== artifact.version
      || canonicalJson(declaration.manifest) !== canonicalJson(artifact.manifest)) throw new Error('标准包元数据不一致');
    for (const key of declaration.shared) if (!Object.hasOwn(shared, key)) throw new Error(`宿主缺少共享模块：${key}`);
    for (const item of Object.values(lockFile.packages ?? {}) as { name?: string }[]) {
      if (item.name && /^(?:vue|vue-router|cordis|cordis-web-framework|@vue\/|@deepseek-ai\/cordis)/.test(item.name)) throw new Error('安装树不能携带宿主共享运行时');
    }
    for (const path of Object.keys(lockFile.packages ?? {})) {
      if (/(?:^|node_modules\/)(?:vue|vue-router|cordis|cordis-web-framework|@vue\/[^/]+)$/.test(path)) throw new Error('安装树不能携带宿主共享运行时');
    }
    const engines = json.engines?.node;
    if (engines && !matchesVersion(process.versions.node, engines)) throw new Error('Node 版本不兼容');
    for (const [name, range] of Object.entries(json.peerDependencies ?? {})) {
      if (name === 'cordis-web-framework') {
        const framework = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
        if (!matchesVersion(framework.version, String(range))) throw new Error('框架 peer 版本不兼容');
      }
      else throw new Error(`请通过 cordisWeb.shared 声明共享能力，而非未解析 peer：${name}`);
    }
    for (const path of [...Object.values(declaration.entries), ...Object.values(declaration.assets)]) await packageFile(packageRoot, path!);
    return { directory, packageRoot, declaration };
  }
  async function validate(artifact: PackageArtifact, environment?: Parameters<PluginPackageRepository['validate']>[1]) {
    if (!active) throw new Error('插件包库尚未持锁');
    validatePackageArtifact(artifact, environment);
    const value = await metadata(artifact);
    validatePackageDeclaration(value.declaration, environment);
    if (await treeDigest(value.directory) !== artifact.integrity) throw new Error('安装树完整性不匹配');
    return value;
  }
  const repository = {
    async recover(installed: readonly PackageArtifact[]) {
      if (active) throw new Error('插件包库已打开');
      await mkdir(root, { recursive: true });
      lock = await open(join(root, '.lock'), 'wx'); active = true;
      try {
        const keep = new Set(installed.map(item => validatePackageArtifact(item).key));
        for (const entry of await readdir(root, { withFileTypes: true })) {
          if (entry.isDirectory() && /^pkg-[a-zA-Z0-9]+$/.test(entry.name) && !keep.has(entry.name)) await rm(inside(root, entry.name), { recursive: true });
        }
      } catch (error) { await repository.close(); throw error; }
    },
    async stage(input: unknown, settings: Parameters<PluginPackageRepository['stage']>[1]): Promise<PackageArtifact> {
      if (!active || settings.acceptTrustedCode !== true) throw new Error('安装需要已持锁包库和可信代码确认');
      const source = input as NodePackageSource;
      let spec: string; let label: string;
      if (source?.type === 'file' && typeof source.path === 'string' && isAbsolute(source.path)) { spec = source.path; label = 'local-file'; }
      else if (source?.type === 'registry' && /^(?:@[a-z0-9_.-]+\/)?[a-z0-9][a-z0-9_.-]*$/.test(source.name)
        && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(source.version)) { spec = source.name + '@' + source.version; label = spec; }
      else throw new Error('仅支持绝对本地路径或 registry 精确版本，不接受命令参数／Git spec');
      let registry: string | undefined;
      if (source.type === 'registry' && source.registry) {
        const url = new URL(source.registry);
        if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) throw new Error('registry 地址无效');
        registry = url.href;
      }
      settings.signal?.throwIfAborted();
      const directory = await mkdtemp(join(root, 'pkg-')); const key = directory.slice(root.length + 1);
      try {
        settings.onProgress?.('installing');
        await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'cw-private-plugin-installation', version: '1.0.0', private: true }));
        await runPackageCommand(['install', spec, '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', '--legacy-peer-deps', '--install-links',
          ...(registry ? ['--registry', registry] : [])], directory, options, settings.signal);
        settings.signal?.throwIfAborted(); settings.onProgress?.('validating');
        const document = JSON.parse(await readFile(join(directory, 'package-lock.json'), 'utf8'));
        const names = Object.keys(document.packages?.['']?.dependencies ?? {});
        if (names.length !== 1) throw new Error('标准包锁文件缺少唯一根依赖');
        const json = JSON.parse(await readFile(await packageFile(join(directory, 'node_modules', names[0]), 'package.json'), 'utf8'));
        if (source.type === 'registry' && (json.name !== source.name || json.version !== source.version)) throw new Error('registry 实际包与请求的精确身份不一致');
        const declaration = validatePackageDeclaration(json.cordisWeb);
        const artifact = validatePackageArtifact({ kind: 'npm', key, name: json.name, version: json.version,
          manifest: declaration.manifest, source: registry ? `${label} (${registry})` : label, integrity: await treeDigest(directory) });
        await metadata(artifact); settings.signal?.throwIfAborted(); settings.onProgress?.('stored'); return artifact;
      } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
    },
    async validate(artifact: PackageArtifact, environment: Parameters<PluginPackageRepository['validate']>[1]) { await validate(artifact, environment); },
    async load(artifact: PackageArtifact, environment: Parameters<PluginPackageRepository['load']>[1]) {
      const { packageRoot, declaration } = await validate(artifact, environment);
      const assets: Record<string, string> = {};
      for (const [id, path] of Object.entries(declaration.assets)) assets[id] = pathToFileURL(await packageFile(packageRoot, path)).href;
      const module = await import(/* @vite-ignore */ pathToFileURL(await packageFile(packageRoot, declaration.entries.node!)).href);
      return instantiatePackage(module, artifact, assets, Object.fromEntries(declaration.shared.map(name => [name, shared[name]])), () => {});
    },
    async exportBrowser(artifact: PackageArtifact): Promise<BrowserPackage> {
      const { packageRoot, declaration } = await validate(artifact);
      if (!declaration.entries.browser) throw new Error('包没有浏览器产物');
      const code = await readFile(await packageFile(packageRoot, declaration.entries.browser), 'utf8');
      const assets: Record<string, { type: string; base64: string }> = {};
      for (const [id, path] of Object.entries(declaration.assets)) assets[id] = { type: assetType(path), base64: (await readFile(await packageFile(packageRoot, path))).toString('base64') };
      const content = { formatVersion: 1 as const, name: artifact.name, declaration, code, assets };
      return { ...content, integrity: await packageDigest(content) };
    },
    async remove(artifact: PackageArtifact) { if (!active) throw new Error('包库未持锁'); await rm(folder(artifact), { recursive: true, force: true }); },
    async close() { if (!lock) return; await lock.close(); lock = undefined; await rm(join(root, '.lock')); active = false; },
  };
  return repository;
}

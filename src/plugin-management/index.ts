import type { Installation, InstallationDocument, ManagementAction, PluginManager, PluginManagerOptions,
  PluginManagerSnapshot, PluginModuleLease } from '../contracts/management.ts';
import type { PluginManifest, RegisteredPlugin } from '../contracts/composition.ts';
import type { PluginHandle } from '../contracts/runtime.ts';
import { installationDocumentValidator, installationValidator } from '../validation-zod/management.ts';
import { manifestValidator, hostEnvironmentValidator } from '../validation-zod/index.ts';
import { freezeData } from '../data/immutable.ts';
import { validateArtifact, assertManifestCompatibility } from './artifact.ts';
import { validateManagedGraph } from './graph.ts';
import { validatePackageArtifact } from './packages.ts';
export { artifactIntegrity, validateArtifact } from './artifact.ts';
export { createMemoryPluginStore } from './memory-store.ts';
export { packageDigest, validateBrowserPackage, validatePackageDeclaration } from './packages.ts';
export type * from '../contracts/management.ts';
export type * from '../contracts/packages.ts';

/** 框架统一管理入口；持久意愿、资源执行和呈现状态不混成一个开关。 */
export async function startPluginManager(options: PluginManagerOptions): Promise<PluginManager> {
  const { runtime, store, loader, environment } = options;
  if (!hostEnvironmentValidator.validate(environment).ok || runtime.inspect().closed || runtime.inspect().plugins.length) {
    throw new Error('管理器需要合法宿主环境和全新运行时');
  }
  const builtins = new Map<string, NonNullable<PluginManagerOptions['builtins']>[number]>();
  for (const builtin of options.builtins ?? []) {
    const parsed = manifestValidator.validate(builtin.plugin.manifest);
    if (!parsed.ok || builtins.has(builtin.plugin.manifest.id)) throw new Error('内置插件清单无效或重复');
    if (builtin.required && builtin.enabled === false) throw new Error('必需内置插件不能默认停用');
    assertManifestCompatibility(parsed.value, environment);
    builtins.set(parsed.value.id, { ...builtin, plugin: { manifest: freezeData(parsed.value), prepare: builtin.plugin.prepare.bind(builtin.plugin) },
      config: structuredClone(builtin.config), bindings: structuredClone(builtin.bindings) });
  }
  const unlock = await store.acquire();
  let document: InstallationDocument = { formatVersion: 1, revision: 0, plugins: [] };
  const handles = new Map<string, PluginHandle>();
  const leases = new Map<string, PluginModuleLease>();
  const failedModuleReleases = new Set<string>();
  const listeners = new Set<(snapshot: PluginManagerSnapshot) => void>();
  const diagnostics: string[] = [];
  let accepting = true;
  let poisoned = false;
  let queue: Promise<unknown> = Promise.resolve();
  let closing: Promise<PluginManagerSnapshot> | undefined;
  let packagesOwned = false;
  const report = (message: string) => { diagnostics.push(message.slice(0, 1024)); if (diagnostics.length > 100) diagnostics.shift(); };
  const manifestFor = (item: Installation) => (item.artifact?.manifest ?? item.package?.manifest ?? builtins.get(item.id)?.plugin.manifest)!;
  const manifests = () => new Map(document.plugins.map(item => [item.id, manifestFor(item)]));
  function inspect(): PluginManagerSnapshot {
    const plugins = document.plugins.map(item => {
      const current = handles.get(item.id)?.inspect();
      return { id: item.id, manifest: manifestFor(item), ...(item.package ? { package: item.package } : {}),
        version: item.version, builtin: !item.artifact && !item.package, required: builtins.get(item.id)?.required ?? false,
        enabled: item.enabled, state: current?.state ?? 'not-loaded' as const, ...(current ? { runtime: current } : {}) };
    });
    const required = [...builtins].filter(([, item]) => item.required).map(([id]) => id);
    return freezeData({ revision: document.revision, closed: !accepting, ready: accepting && !poisoned && runtime.audit(required).ready,
      plugins, ...(document.operation ? { operation: document.operation } : {}), diagnostics: [...diagnostics] });
  }
  function notify() {
    for (const listener of [...listeners]) try { listener(inspect()); } catch { listeners.delete(listener); report('管理状态观察者失败'); }
  }
  async function save(plugins: readonly Installation[], operation = document.operation) {
    const next = { formatVersion: 1 as const, revision: document.revision + 1, plugins, ...(operation ? { operation } : {}) };
    const parsed = installationDocumentValidator.validate(next);
    if (!parsed.ok) throw new Error('安装记录格式无效');
    if (new TextEncoder().encode(JSON.stringify(next)).byteLength > 33_554_432) throw new Error('插件库超过 32 MiB');
    try { await store.write(document.revision, parsed.value); }
    catch (error) { poisoned = true; report('持久保存失败；停止新管理操作，需关闭后核对恢复'); notify(); throw error; }
    document = freezeData(parsed.value); notify();
  }
  async function releaseModule(id: string) {
    const lease = leases.get(id);
    if (!lease) return;
    try { await lease.release(); leases.delete(id); failedModuleReleases.delete(id); }
    catch (error) { failedModuleReleases.add(id); report(`插件模块释放失败：${id}`); throw error; }
  }
  const stop = async (id: string) => {
    const handle = handles.get(id);
    if (handle) {
      const snapshot = await handle.stop();
      if (snapshot.state !== 'stopped') throw new Error(`插件未干净停用：${id} (${snapshot.state})`);
      handles.delete(id);
      runtime.forgetStopped?.(id);
    }
    // 模块可能已加载，但 prepare 失败而尚未创建运行句柄。
    await releaseModule(id);
  };
  async function releaseResources() {
    const snapshot = await runtime.close();
    if (snapshot.plugins.some(item => item.state !== 'stopped')) {
      report('运行时未干净关闭，插件库独占权保留');
      throw new Error('管理器清理失败');
    }
    unsubscribe();
    const errors: unknown[] = [];
    for (const id of [...leases.keys()]) {
      try { await releaseModule(id); } catch (error) { errors.push(error); }
    }
    // 未释放的模块仍借用加载器／仓库资源，不能先关闭其所有者或交出库锁。
    if (errors.length) throw new AggregateError(errors, '管理器清理失败；插件库独占权保留');
    handles.clear();
    for (const [name, cleanup] of [
      ['模块加载器', () => loader.close?.()],
      ['标准包仓库', async () => {
        if (packagesOwned) { await options.packages!.close(); packagesOwned = false; }
      }],
    ] as const) {
      try { await cleanup(); }
      catch (error) { report(`${name}关闭失败`); errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, '管理器清理失败；插件库独占权保留');
    try { await unlock(); }
    catch (error) { report('插件库独占权释放失败'); throw error; }
  }
  async function moduleFor(item: Installation): Promise<RegisteredPlugin> {
    if (failedModuleReleases.has(item.id)) throw new Error(`插件模块未干净释放，须先完成停用：${item.id}`);
    if (item.package) {
      if (!options.packages) throw new Error('标准包需要平台仓库适配');
      let lease = leases.get(item.id);
      if (!lease) { lease = await options.packages.load(item.package, environment); leases.set(item.id, lease); }
      return lease.plugin;
    }
    if (!item.artifact) return builtins.get(item.id)!.plugin;
    let lease = leases.get(item.id);
    if (!lease) { lease = await loader.load(item.artifact, environment); leases.set(item.id, lease); }
    return lease.plugin;
  }
  async function reconcile() {
    validateManagedGraph(document.plugins, manifests());
    for (const id of new Set([...handles.keys(), ...leases.keys()])) {
      if (!document.plugins.some(item => item.id === id && item.enabled)) await stop(id);
    }
    const failures: string[] = [];
    for (const item of document.plugins) {
      if (!item.enabled || handles.has(item.id)) continue;
      try {
        const plugin = await moduleFor(item); const configured = plugin.prepare(item.config);
        if (!configured.ok || typeof configured.value !== 'function') throw new Error('插件配置校验失败');
        handles.set(item.id, runtime.load({ id: item.id, requires: plugin.manifest.requires.map(value => ({ id: value.id })),
          provides: plugin.manifest.provides.map(value => ({ id: value.id })), setup: configured.value }));
      } catch (error) { failures.push(`${item.id}: ${error instanceof Error ? error.message : '加载失败'}`); }
    }
    await runtime.settle();
    for (const [id, handle] of handles) if (['failed', 'cleanup-failed'].includes(handle.inspect().state)) failures.push(`${id}: ${handle.inspect().state}`);
    if (failures.length) throw new Error(failures.join('；'));
  }
  function find(id: string) { const value = document.plugins.find(item => item.id === id); if (!value) throw new Error(`插件未安装：${id}`); return value; }
  function enqueue(action: ManagementAction, id: string, prepare: () => Promise<readonly Installation[]> | readonly Installation[],
    finish?: () => readonly Installation[], afterPersist?: () => Promise<void>, afterCommit?: () => Promise<void>): Promise<PluginManagerSnapshot> {
    if (!accepting || poisoned) return Promise.reject(new Error('管理器已关闭或持久状态待恢复'));
    const task = queue.then(async () => {
      if (poisoned) throw new Error('持久状态待恢复，拒绝后续排队操作');
      const records = await prepare();
      const known = new Map(records.map(item => [item.id, manifestFor(item)]));
      validateManagedGraph(records, known);
      const operation = { id: crypto.randomUUID(), action, pluginId: id, state: 'pending' as const };
      await save(records, operation);
      try {
        await afterPersist?.();
        await reconcile();
        await save(finish?.() ?? document.plugins, { ...operation, state: 'succeeded' });
        await afterCommit?.();
        return inspect();
      } catch (error) {
        const message = error instanceof Error ? error.message : '管理操作失败'; report(message);
        if (!poisoned) await save(document.plugins, { ...operation, state: 'failed', error: message.slice(0, 1024) });
        notify(); throw error;
      }
    });
    queue = task.catch(() => {}); return task;
  }
  const unsubscribe = runtime.subscribe(notify);
  try {
    const raw = await store.read();
    if (raw !== undefined) {
      const parsed = installationDocumentValidator.validate(raw);
      if (!parsed.ok) throw new Error('插件库格式无效，不能静默重置');
      document = freezeData(parsed.value);
      if (document.plugins.some(item => item.package) && !options.packages) throw new Error('标准包需要平台仓库适配');
      await options.packages?.recover(document.plugins.flatMap(item => item.package ? [item.package] : []));
      packagesOwned = options.packages !== undefined;
      for (const item of document.plugins) {
        if (item.package) {
          const artifact = validatePackageArtifact(item.package, environment);
          if (artifact.manifest.id !== item.id || artifact.version !== item.version || builtins.has(item.id)) throw new Error('标准包安装身份不一致');
          await options.packages!.validate(artifact, environment);
        } else if (item.artifact) {
          const artifact = await validateArtifact(item.artifact, environment);
          if (artifact.manifest.id !== item.id || artifact.manifest.version !== item.version || builtins.has(item.id)) throw new Error('安装记录身份不一致');
        } else if (!builtins.has(item.id) || builtins.get(item.id)!.plugin.manifest.version !== item.version) throw new Error('内置插件目录与持久记录不一致');
        if (builtins.get(item.id)?.required && !item.enabled) throw new Error('必需插件的持久意愿不可停用');
      }
      if ([...builtins.keys()].some(id => !document.plugins.some(item => item.id === id))) throw new Error('内置目录变化需要显式迁移');
      if (document.operation?.state === 'pending') report(`恢复中断操作：${document.operation.action} ${document.operation.pluginId}`);
    } else {
      await options.packages?.recover([]);
      packagesOwned = options.packages !== undefined;
      const initial = await options.initialize?.();
      if (initial && (initial.length !== builtins.size || new Set(initial.map(item => item.id)).size !== initial.length
        || initial.some(item => !builtins.has(item.id) || (builtins.get(item.id)?.required && !item.enabled)))) throw new Error('首次配置迁移身份或必需状态无效');
      await save([...builtins].map(([id, item]) => ({
        ...(initial?.find(value => value.id === id) ?? { enabled: item.enabled ?? true,
          config: item.config === undefined ? {} : item.config, bindings: item.bindings ?? {} }), id, version: item.plugin.manifest.version })));
    }
    try { await reconcile(); }
    catch (error) { report(error instanceof Error ? error.message : '恢复失败'); }
    if (document.operation?.state === 'pending') await save(document.plugins, { ...document.operation,
      action: 'recover', state: diagnostics.length ? 'failed' : 'succeeded', error: '上次操作中断，已按持久意愿重新协调；请核对实际状态' });
  } catch (error) {
    accepting = false;
    try { await releaseResources(); }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], '管理器启动失败且清理失败；插件库独占权保留', { cause: error });
    }
    throw error;
  }
  const manager: PluginManager = {
    inspect,
    configuration(id) { const item = find(id); return freezeData({ config: item.config, bindings: item.bindings }); },
    subscribe(listener) { if (!accepting) throw new Error('管理器已关闭'); listeners.add(listener); return () => { listeners.delete(listener); }; },
    install(input, settings) {
      // 在入队前复制输入，调用方后续修改不能改变待安装的内容。
      const copy = structuredClone(input); const accepted = settings.acceptedIntegrity;
      const config = structuredClone(settings.config ?? null); const bindings = structuredClone(settings.bindings ?? {});
      return enqueue('install', 'package', async () => {
        const artifact = await validateArtifact(copy, environment);
        if (artifact.integrity !== accepted) throw new Error('必须明确接受精确插件摘要');
        if (document.plugins.some(item => item.id === artifact.manifest.id)) throw new Error('插件身份已安装');
        const item = installationValidator.validate({ id: artifact.manifest.id, version: artifact.manifest.version, artifact, enabled: false, config, bindings });
        if (!item.ok) throw new Error('安装配置格式无效');
        return [...document.plugins, item.value];
      });
    },
    installPackage(input, settings) {
      const copy = structuredClone(input); const config = structuredClone(settings.config ?? null);
      const bindings = structuredClone(settings.bindings ?? {});
      return enqueue('install', 'package', async () => {
        if (!options.packages || settings.acceptTrustedCode !== true) throw new Error('标准包需要平台仓库及可信代码确认');
        const artifact = await options.packages.stage(copy, settings);
        try {
          validatePackageArtifact(artifact, environment); await options.packages.validate(artifact, environment);
          settings.signal?.throwIfAborted();
          if (document.plugins.some(item => item.id === artifact.manifest.id)) throw new Error('插件身份已安装');
          const parsed = installationValidator.validate({ id: artifact.manifest.id, version: artifact.version,
            package: artifact, enabled: false, config, bindings });
          if (!parsed.ok) throw new Error('安装配置格式无效');
          const records = [...document.plugins, parsed.value];
          validateManagedGraph(records, new Map(records.map(item => [item.id, manifestFor(item)])));
          return records;
        } catch (error) { await options.packages.remove(artifact); throw error; }
      });
    },
    enable(id) { return enqueue('enable', id, () => { find(id); return document.plugins.map(item => item.id === id ? { ...item, enabled: true } : item); }); },
    disable(id) { return enqueue('disable', id, () => {
      find(id); if (builtins.get(id)?.required) throw new Error('必需插件不可停用');
      return document.plugins.map(item => item.id === id ? { ...item, enabled: false } : item);
    }); },
    configure(id, settings) {
      const copy = structuredClone(settings);
      return enqueue('configure', id, () => {
        const item = find(id);
        if (!copy.restart && (item.enabled || handles.has(id))) throw new Error('修改配置前必须干净停用');
        if (copy.restart && builtins.get(id)?.required) throw new Error('必需插件不可在运行中重启');
        const parsed = installationValidator.validate({ ...item, config: copy.config, bindings: copy.bindings, enabled: copy.restart ? true : item.enabled });
        if (!parsed.ok) throw new Error('插件配置格式无效');
        return document.plugins.map(value => value.id === id ? parsed.value : value);
      }, undefined, copy.restart ? () => stop(id) : undefined);
    },
    uninstall(id) { let installedPackage: Installation['package']; return enqueue('uninstall', id, () => {
      const item = find(id); if (!item.artifact && !item.package) throw new Error('内置插件不可卸载');
      installedPackage = item.package;
      if (document.plugins.some(value => value.id !== id && Object.values(value.bindings).includes(id))) throw new Error('仍有安装项依赖此插件');
      return document.plugins.map(value => value.id === id ? { ...value, enabled: false } : value);
    }, () => document.plugins.filter(value => value.id !== id), undefined,
      async () => { if (installedPackage) await options.packages!.remove(installedPackage); }); },
    async drain() { accepting = false; await queue; },
    close() {
      if (closing) return closing;
      accepting = false;
      closing = (async () => {
        await queue;
        try { await releaseResources(); }
        catch (error) { notify(); throw error; }
        notify(); listeners.clear(); return inspect();
      })();
      return closing;
    },
  };
  return Object.freeze(manager);
}

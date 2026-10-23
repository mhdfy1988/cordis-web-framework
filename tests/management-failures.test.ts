import assert from 'node:assert/strict';
import test from 'node:test';
import { startPluginManager, createMemoryPluginStore, artifactIntegrity } from '../src/plugin-management/index.ts';
import { createCordisRuntime } from '../src/runtime-cordis/index.ts';
import { createNodePluginLoader } from '../src/hosts/node/plugin-loader.ts';
import { createBrowserPackageRepository } from '../src/hosts/browser/package-repository.ts';
import type { PluginModuleLoader, PluginStore } from '../src/contracts/management.ts';
const environment = { platform: 'node' as const, capabilities: [] };
async function artifact(id: string, code = '', service?: string, requires: { id: string; range: string }[] = []) {
  const content = { formatVersion: 1 as const, manifest: { id, version: '1.0.0', apiVersion: '^1', requires,
    provides: service ? [{ id: service, version: '1.0.0' }] : [] }, entries: { node: `export default manifest => ({manifest,prepare:()=>({ok:true,value(scope){
      ${service ? `scope.provide({id:${JSON.stringify(service)}},{value:1});` : ''} ${code}
    }})})` }, assets: [] };
  return { ...content, integrity: await artifactIntegrity(content) };
}
async function manager(store: PluginStore = createMemoryPluginStore()) { return startPluginManager({ store, runtime: createCordisRuntime(), loader: createNodePluginLoader(), environment }); }

test('启动失败的管理器不得关闭另一个管理器已持有的包仓库', async () => {
  const packages = createBrowserPackageRepository();
  const open = () => startPluginManager({ store: createMemoryPluginStore(), runtime: createCordisRuntime(),
    loader: createNodePluginLoader(), packages, environment: { platform: 'browser', capabilities: [] } });
  const first = await open();
  try {
    await assert.rejects(open(), /仓库已打开/);
    assert.equal(first.inspect().closed, false);
    await assert.rejects(packages.recover([]), /仓库已打开/, '第一个管理器仍持有仓库独占权');
  } finally { await first.close(); }
  await packages.recover([]);
  await packages.close();
});

test('P7 写入失败后已排队操作不得继续执行，重开回读未提交状态', async () => {
  const backing = createMemoryPluginStore(); let fail = false;
  const store: PluginStore = { ...backing, async write(revision, document) { if (fail) throw new Error('disk-full'); await backing.write(revision, document); } };
  const current = await manager(store); const value = await artifact('writes');
  await current.install(value, { acceptedIntegrity: value.integrity }); fail = true;
  const first = current.enable('writes'); const second = current.disable('writes');
  const results = await Promise.allSettled([first, second]); assert.ok(results.every(item => item.status === 'rejected'));
  assert.equal(current.inspect().plugins[0].state, 'not-loaded'); assert.ok(current.inspect().diagnostics.some(item => item.includes('保存失败')));
  await current.close(); fail = false;
  const reopened = await manager(store); assert.equal(reopened.inspect().plugins[0].enabled, false); await reopened.close();
});
test('P7 清理失败保留安装和错误，不能卸载或复用；无关能力仍运行', async () => {
  const backing = createMemoryPluginStore(); let release: (() => void | Promise<void>) | undefined;
  const store: PluginStore = { ...backing, async acquire() { release = await backing.acquire(); return release; } };
  const current = await manager(store);
  const bad = await artifact('dirty', 'scope.onDispose(()=>{throw new Error("cleanup-fault")});');
  const good = await artifact('unrelated');
  for (const value of [good, bad]) { await current.install(value, { acceptedIntegrity: value.integrity }); await current.enable(value.manifest.id); }
  await assert.rejects(current.uninstall('dirty'), /干净停用/);
  assert.equal(current.inspect().plugins.find(item => item.id === 'dirty')?.state, 'cleanup-failed');
  assert.equal(current.inspect().plugins.find(item => item.id === 'unrelated')?.state, 'ready');
  await assert.rejects(current.enable('dirty')); await assert.rejects(current.close(), /清理失败/);
  await assert.rejects(backing.acquire(), /占用/);
  // 模拟操作者在已确认测试进程不再执行插件后释放测试库；不是产品静默抢锁逻辑。
  await release?.();
});
test('P7 服务版本与循环冲突在激活前拒绝，不破坏运行中的提供者', async () => {
  const current = await manager();
  const provider = await artifact('provider', '', 'shared');
  const consumer = await artifact('consumer', '', undefined, [{ id: 'shared', range: '^2' }]);
  await current.install(provider, { acceptedIntegrity: provider.integrity }); await current.enable('provider');
  await current.install(consumer, { acceptedIntegrity: consumer.integrity, bindings: { shared: 'provider' } });
  await assert.rejects(current.enable('consumer'), /service-incompatible/);
  assert.equal(current.inspect().plugins.find(item => item.id === 'provider')?.state, 'ready');
  assert.equal(current.inspect().plugins.find(item => item.id === 'consumer')?.enabled, false);
  const a = await artifact('cycle-a', '', 'a', [{ id: 'b', range: '^1' }]);
  const b = await artifact('cycle-b', '', 'b', [{ id: 'a', range: '^1' }]);
  await current.install(a, { acceptedIntegrity: a.integrity, bindings: { b: 'cycle-b' } });
  await current.install(b, { acceptedIntegrity: b.integrity, bindings: { a: 'cycle-a' } });
  await current.enable('cycle-a'); await assert.rejects(current.enable('cycle-b'), /dependency-cycle/);
  await current.close();
});
test('P7 包顶层不能在安装时执行，外部输入在排队后变动不改变已接纳包', async () => {
  const current = await manager();
  const value = await artifact('immutable'); const accepted = value.integrity;
  const installing = current.install(value, { acceptedIntegrity: accepted }); value.manifest.id = 'changed';
  await installing; assert.equal(current.inspect().plugins[0].id, 'immutable');
  const bad = await artifact('top-level'); bad.entries.node = 'throw new Error("top-level-failed")';
  const { integrity: _ignored, ...content } = bad; bad.integrity = await artifactIntegrity(content);
  await current.install(bad, { acceptedIntegrity: bad.integrity }); await assert.rejects(current.enable('top-level'), /top-level-failed/);
  await current.disable('top-level'); await current.uninstall('top-level'); await current.close();
});
test('P7 连续 30 轮启停归档代码引用，运行身份不复用，首次迁移不覆盖持久设置', async () => {
  let reads = 0; const store = createMemoryPluginStore();
  const runtime = createCordisRuntime();
  const current = await startPluginManager({ store, runtime, loader: createNodePluginLoader(), environment, initialize() { reads++; return []; } });
  const value = await artifact('cycles'); await current.install(value, { acceptedIntegrity: value.integrity });
  const ids = new Set<string>();
  for (let round = 0; round < 30; round++) {
    await current.enable('cycles'); ids.add(current.inspect().plugins[0].runtime!.instanceId);
    await current.disable('cycles'); assert.equal(runtime.inspect().plugins.length, 0);
  }
  assert.equal(ids.size, 30); await current.close();
  const reopened = await startPluginManager({ store, runtime: createCordisRuntime(), loader: createNodePluginLoader(), environment,
    initialize() { throw new Error('不得再次读取旧设置'); } });
  assert.equal(reads, 1); assert.equal(reopened.inspect().plugins[0].enabled, false); await reopened.close();
});

test('配置校验失败后，停用和直接卸载都释放尚无运行句柄的模块', async () => {
  for (const action of ['disable', 'uninstall'] as const) {
    let live = 0;
    const loader: PluginModuleLoader = { async load(value) {
      live++;
      return { plugin: { manifest: value.manifest, prepare: () => ({ ok: false, issues: [] }) }, release() { live--; } };
    } };
    const current = await startPluginManager({ store: createMemoryPluginStore(), runtime: createCordisRuntime(), loader, environment });
    try {
      const value = await artifact('invalid-config');
      await current.install(value, { acceptedIntegrity: value.integrity });
      await assert.rejects(current.enable(value.manifest.id), /配置校验失败/);
      assert.equal(live, 1);
      await current[action](value.manifest.id);
      assert.equal(live, 0, `${action} 必须释放无运行句柄的模块`);
      if (action === 'disable') await current.uninstall(value.manifest.id);
      assert.equal(current.inspect().plugins.length, 0);
    } finally { await current.close(); }
  }
});

test('模块释放失败不阻断其他模块释放，错误可观察且保留库独占权', async () => {
  const backing = createMemoryPluginStore(); let unlock: (() => void | Promise<void>) | undefined;
  const store: PluginStore = { ...backing, async acquire() { unlock = await backing.acquire(); return unlock; } };
  const released: string[] = [];
  const current = await startPluginManager({ store, runtime: createCordisRuntime(), environment, loader: {
    async load(value) { return { plugin: { manifest: value.manifest, prepare: () => ({ ok: true, value() {} }) },
      release() { released.push(value.manifest.id); if (value.manifest.id === 'release-bad') throw new Error('module-release-fault'); } }; },
  } });
  try {
    for (const id of ['release-bad', 'release-good']) {
      const value = await artifact(id); await current.install(value, { acceptedIntegrity: value.integrity }); await current.enable(id);
    }
    const closing = current.close();
    assert.strictEqual(current.close(), closing);
    await assert.rejects(closing, /清理失败/);
    assert.deepEqual(released, ['release-bad', 'release-good']);
    assert.ok(current.inspect().diagnostics.some(value => value.includes('release-bad')));
    await assert.rejects(backing.acquire(), /占用/);
  } finally {
    // 隔离夹具没有真实外部资源；仅清除测试持锁，不是产品自动抢锁。
    await unlock?.();
  }
});

test('恢复结果保存失败时，释放已加载模块和加载器后才释放库锁', async () => {
  const backing = createMemoryPluginStore(); const events: string[] = [];
  const value = await artifact('recover-resource');
  const unlock = await backing.acquire();
  await backing.write(0, { formatVersion: 1, revision: 1,
    plugins: [{ id: value.manifest.id, version: '1.0.0', artifact: value, enabled: true, config: {}, bindings: {} }],
    operation: { id: 'interrupted', action: 'enable', pluginId: value.manifest.id, state: 'pending' } });
  await unlock();
  const runtime = createCordisRuntime();
  await assert.rejects(startPluginManager({ runtime, environment, store: { ...backing,
    async acquire() { const release = await backing.acquire(); return async () => { events.push('unlock'); await release(); }; },
    async write() { throw new Error('recovery-disk-full'); },
  }, loader: {
    async load(input) { return { plugin: { manifest: input.manifest, prepare: () => ({ ok: true, value() {} }) },
      release() { assert.equal(runtime.inspect().closed, true); events.push('module'); } }; },
    close() { events.push('loader'); },
  } }), /recovery-disk-full/);
  assert.deepEqual(events, ['module', 'loader', 'unlock']);
  const release = await backing.acquire(); await release();
});

test('启动错误与清理错误同时保留，清理失败时不释放安装库锁', async () => {
  const backing = createMemoryPluginStore(); let unlock: (() => void | Promise<void>) | undefined;
  const events: string[] = [];
  const value = await artifact('recover-dirty');
  const release = await backing.acquire();
  await backing.write(0, { formatVersion: 1, revision: 1,
    plugins: [{ id: value.manifest.id, version: '1.0.0', artifact: value, enabled: true, config: {}, bindings: {} }],
    operation: { id: 'interrupted', action: 'enable', pluginId: value.manifest.id, state: 'pending' } });
  await release();
  try {
    await assert.rejects(startPluginManager({ runtime: createCordisRuntime(), environment, store: { ...backing,
      async acquire() { unlock = await backing.acquire(); return unlock; },
      async write() { throw new Error('startup-disk-full'); },
    }, loader: {
      async load(input) { return { plugin: { manifest: input.manifest, prepare: () => ({ ok: true, value() {} }) },
        release() { events.push('module'); throw new Error('startup-release-fault'); } }; },
    } }), (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.match(String(error.cause), /startup-disk-full/);
      assert.match(error.message, /清理失败/);
      return true;
    });
    assert.deepEqual(events, ['module']);
    await assert.rejects(backing.acquire(), /占用/);
  } finally { await unlock?.(); }
});

test('加载器关闭失败仍尝试关闭独立包仓库，不假报清理成功', async () => {
  const backing = createMemoryPluginStore(); let unlock: (() => void | Promise<void>) | undefined;
  const events: string[] = [];
  const unused = async (): Promise<never> => { throw new Error('不应调用'); };
  const current = await startPluginManager({ runtime: createCordisRuntime(), environment, store: { ...backing,
    async acquire() { unlock = await backing.acquire(); return unlock; },
  }, loader: { load: unused, close() { events.push('loader'); throw new Error('loader-close-fault'); } },
  packages: { recover: async () => {}, stage: unused, load: unused, validate: unused, remove: unused,
    async close() { events.push('packages'); } },
  });
  try {
    await assert.rejects(current.close(), (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.match(String(error.errors[0]), /loader-close-fault/); return true;
    });
    assert.deepEqual(events, ['loader', 'packages']);
    assert.ok(current.inspect().diagnostics.some(value => value.includes('加载器关闭失败')));
    await assert.rejects(backing.acquire(), /占用/);
  } finally { await unlock?.(); }
});

test('停用时模块释放失败，不得重新启用脏模块；完成释放后才可重新加载', async () => {
  let fail = true; let loads = 0;
  const current = await startPluginManager({ store: createMemoryPluginStore(), runtime: createCordisRuntime(), environment,
    loader: { async load(input) {
      loads++;
      return { plugin: { manifest: input.manifest, prepare: () => ({ ok: true, value() {} }) },
        release() { if (fail) throw new Error('release-interrupted'); } };
    } },
  });
  try {
    const value = await artifact('release-retry');
    await current.install(value, { acceptedIntegrity: value.integrity }); await current.enable(value.manifest.id);
    await assert.rejects(current.disable(value.manifest.id), /release-interrupted/);
    await assert.rejects(current.enable(value.manifest.id), /未干净释放/);
    assert.equal(loads, 1); assert.equal(current.inspect().plugins[0].state, 'not-loaded');
    fail = false;
    await current.disable(value.manifest.id); await current.enable(value.manifest.id);
    assert.equal(loads, 2); assert.equal(current.inspect().plugins[0].state, 'ready');
  } finally { fail = false; await current.close(); }
});

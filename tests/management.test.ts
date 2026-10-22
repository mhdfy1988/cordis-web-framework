import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startPluginManager, createMemoryPluginStore, artifactIntegrity } from '../src/plugin-management/index.ts';
import { createCordisRuntime } from '../src/runtime-cordis/index.ts';
import { createNodePluginStore } from '../src/hosts/node/plugin-store.ts';
import { createNodePluginLoader } from '../src/hosts/node/plugin-loader.ts';
import type { PluginArtifact, PluginStore } from '../src/contracts/management.ts';

async function pack(id: string, value = ''): Promise<PluginArtifact> {
  const consumer = id === 'consumer';
  const manifest = { id, version: '1.0.0', apiVersion: '^1', requires: consumer ? [{ id: 'greeting', range: '^1' }] : [],
    provides: consumer ? [] : [{ id: 'greeting', version: '1.0.0' }] };
  const node = `export default manifest => ({manifest,prepare:config => ({ok:true,value(scope){
    ${consumer ? 'globalThis.__managementEvents.push(scope.get({id:"greeting"}).text);' : 'scope.provide({id:"greeting"},{text:"你好"});'}
    ${value}
    scope.onDispose(()=>globalThis.__managementEvents.push('released:${id}'));
  }})})`;
  const content = { formatVersion: 1 as const, manifest, entries: { node }, assets: [] };
  return { ...content, integrity: await artifactIntegrity(content) };
}
const environment = { platform: 'node' as const, capabilities: [] };
function open(store: PluginStore) { return startPluginManager({ runtime: createCordisRuntime(), store, loader: createNodePluginLoader(), environment }); }
function events(): string[] { const global = globalThis as unknown as { __managementEvents: string[] }; global.__managementEvents = []; return global.__managementEvents; }

test('P4 无界面：事后未知独立包安装不执行，依赖等待／恢复、重新启用、卸载与磁盘重启', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cw-manager-'));
  const log = events();
  try {
    const file = join(directory, 'plugins.json');
    const manager = await open(createNodePluginStore(file));
    // 包在宿主启动后才构造，证明不依赖可信预注册目录。
    const consumer = await pack('consumer'); const provider = await pack('provider');
    await manager.install(consumer, { acceptedIntegrity: consumer.integrity, bindings: { greeting: 'provider' } });
    assert.deepEqual(log, []);
    await manager.enable('consumer'); assert.equal(manager.inspect().plugins[0].state, 'waiting');
    await manager.install(provider, { acceptedIntegrity: provider.integrity });
    await manager.enable('provider'); assert.deepEqual(log, ['你好']);
    await manager.disable('provider');
    assert.equal(manager.inspect().plugins.find(item => item.id === 'consumer')?.state, 'waiting');
    assert.equal(log.filter(item => item === 'released:consumer').length, 1);
    await manager.enable('provider'); assert.equal(log.filter(item => item === '你好').length, 2);
    await assert.rejects(manager.uninstall('provider'), /依赖/);
    await manager.disable('consumer'); await manager.disable('provider'); await manager.close();
    const disk = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(disk.plugins.length, 2); assert.ok(disk.plugins.every((item: { enabled: boolean }) => !item.enabled));
    const reopened = await open(createNodePluginStore(file));
    assert.ok(reopened.inspect().plugins.every(item => item.state === 'not-loaded' && !item.enabled));
    await reopened.enable('provider'); await reopened.enable('consumer');
    await reopened.uninstall('consumer'); await reopened.uninstall('provider'); await reopened.close();
    const empty = await open(createNodePluginStore(file)); assert.deepEqual(empty.inspect().plugins, []); await empty.close();
  } finally { await rm(directory, { recursive: true }); }
});
test('P4 并发图变更串行、冲突拒绝、坏配置／坏包不重置、存储失败显式报告', async () => {
  events(); const store = createMemoryPluginStore(); const manager = await open(store); const artifact = await pack('provider');
  await assert.rejects(manager.install(artifact, { acceptedIntegrity: 'unaccepted' }), /摘要/);
  assert.deepEqual(manager.inspect().plugins, []);
  await manager.install(artifact, { acceptedIntegrity: artifact.integrity });
  await Promise.all([manager.enable('provider'), manager.disable('provider'), manager.enable('provider')]);
  assert.equal(manager.inspect().plugins[0].state, 'ready');
  await assert.rejects(manager.configure('provider', { config: {}, bindings: {} }), /停用/);
  await manager.close();
  const failedStore: PluginStore = { ...createMemoryPluginStore(), async write() { throw new Error('disk-full'); } };
  await assert.rejects(open(failedStore), /disk-full/);
});
test('P4 激活失败保留启用意愿与真实失败状态，干净停止后可卸载', async () => {
  events(); const manager = await open(createMemoryPluginStore());
  const artifact = await pack('provider', 'throw new Error("activation-fault");');
  await manager.install(artifact, { acceptedIntegrity: artifact.integrity });
  await assert.rejects(manager.enable('provider'), /failed/);
  assert.equal(manager.inspect().plugins[0].enabled, true);
  assert.equal(manager.inspect().operation?.state, 'failed');
  await manager.disable('provider'); await manager.uninstall('provider'); await manager.close();
});
test('P4 pending 恢复保留意愿和中断诊断；数据损坏不静默清空', async () => {
  const store = createMemoryPluginStore(); const artifact = await pack('provider'); events();
  const release = await store.acquire();
  await store.write(0, { formatVersion: 1, revision: 1, plugins: [{ id: 'provider', version: '1.0.0', artifact, enabled: true, config: {}, bindings: {} }],
    operation: { id: 'interrupted', action: 'enable', pluginId: 'provider', state: 'pending' } }); await release();
  const manager = await open(store); assert.equal(manager.inspect().plugins[0].state, 'ready');
  assert.ok(manager.inspect().diagnostics.some(item => item.includes('中断'))); await manager.close();
  const broken: PluginStore = { ...createMemoryPluginStore(), async read() { return { formatVersion: 99 }; } };
  await assert.rejects(open(broken), /不能静默重置/);
});

test('P6 配置重启先持久保存完整目标意愿，重开不会停留在临时停用状态', async () => {
  events(); const store = createMemoryPluginStore(); const artifact = await pack('provider'); const manager = await open(store);
  await manager.install(artifact, { acceptedIntegrity: artifact.integrity }); await manager.enable('provider');
  await manager.configure('provider', { config: { variant: 'topbar' }, bindings: {}, restart: true });
  assert.equal(manager.inspect().plugins[0].state, 'ready'); await manager.close();
  const reopened = await open(store); assert.equal(reopened.inspect().plugins[0].enabled, true);
  assert.deepEqual(reopened.configuration('provider').config, { variant: 'topbar' }); await reopened.close();
});

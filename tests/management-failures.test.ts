import assert from 'node:assert/strict';
import test from 'node:test';
import { startPluginManager, createMemoryPluginStore, artifactIntegrity } from '../src/plugin-management/index.ts';
import { createCordisRuntime } from '../src/runtime-cordis/index.ts';
import { createNodePluginLoader } from '../src/hosts/node/plugin-loader.ts';
import type { PluginStore } from '../src/contracts/management.ts';
const environment = { platform: 'node' as const, capabilities: [] };
async function artifact(id: string, code = '', service?: string, requires: { id: string; range: string }[] = []) {
  const content = { formatVersion: 1 as const, manifest: { id, version: '1.0.0', apiVersion: '^1', requires,
    provides: service ? [{ id: service, version: '1.0.0' }] : [] }, entries: { node: `export default manifest => ({manifest,prepare:()=>({ok:true,value(scope){
      ${service ? `scope.provide({id:${JSON.stringify(service)}},{value:1});` : ''} ${code}
    }})})` }, assets: [] };
  return { ...content, integrity: await artifactIntegrity(content) };
}
async function manager(store: PluginStore = createMemoryPluginStore()) { return startPluginManager({ store, runtime: createCordisRuntime(), loader: createNodePluginLoader(), environment }); }

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

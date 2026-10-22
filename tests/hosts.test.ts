import assert from 'node:assert/strict';
import test from 'node:test';
import { createCordisRuntime as createRuntime } from '../src/runtime-cordis/index.ts';
import { startNodeHost, HostStartError, bindProcessSignals } from '../src/hosts/node/index.ts';
import { openHost } from '../src/hosts/shared/lifecycle.ts';
import { CompositionRejectedError } from '../src/plugin-composition/index.ts';
import type { HostOptions } from '../src/contracts/host.ts';
import type { PluginManifest, RegisteredPlugin } from '../src/contracts/composition.ts';
import type { PluginHandle, PluginScope, Runtime } from '../src/contracts/runtime.ts';
import { spawnSync } from 'node:child_process';

function fixture(setup: (scope: PluginScope) => void | Promise<void> = () => {}, host?: PluginManifest['host']): HostOptions {
  const plugin: RegisteredPlugin = { manifest: { id: 'fixture', version: '1.0.0', apiVersion: '^1',
    requires: [], provides: [], ...(host ? { host } : {}) }, prepare: () => ({ ok: true, value: setup }) };
  return { document: { formatVersion: 1, plugins: [{ id: 'fixture', version: '1.0.0', entry: 'fixture' }], bindings: {} },
    catalog: new Map([['fixture', plugin]]), createRuntime };
}

test('平台和能力预检失败不创建运行时、不申请资源、不激活插件', async () => {
  for (const required of [{ platforms: ['browser'] as const, capabilities: [] },
    { platforms: ['node'] as const, capabilities: ['dom'] }]) {
    let touched = 0;
    const options = fixture(() => { touched++; }, required);
    await assert.rejects(startNodeHost({ ...options, createRuntime() { touched++; return createRuntime(); } }), CompositionRejectedError);
    assert.equal(touched, 0);
  }
});
test('显式必需名单：可选扩展停用不误报未就绪，必需插件停用仍拒绝健康接入', async () => {
  const base = fixture(); const optional: RegisteredPlugin = { manifest: { id: 'optional', version: '1.0.0', apiVersion: '^1', requires: [], provides: [] },
    prepare: () => ({ ok: true, value() {} }) };
  const handles = new Map<string, PluginHandle>();
  const required = ['fixture'];
  const host = await startNodeHost({ ...base, requiredPluginIds: required,
    document: { formatVersion: 1, plugins: ['fixture', 'optional'].map(id => ({ id, version: '1.0.0', entry: id })), bindings: {} },
    catalog: new Map([...base.catalog, ['optional', optional]]), createRuntime() {
      const runtime = createRuntime(); return { ...runtime, load(definition) { const handle = runtime.load(definition); handles.set(definition.id, handle); return handle; } };
    } });
  try {
    required.push('missing');
    await handles.get('optional')!.stop(); assert.equal(host.inspect().state, 'ready');
    assert.deepEqual(await (await fetch(`${host.address}/health/ready`)).json(), { ready: true });
    assert.equal(host.inspect().runtime.plugins.find(plugin => plugin.id === 'optional')?.state, 'stopped');
    await handles.get('fixture')!.stop(); assert.equal(host.inspect().state, 'not-ready');
    assert.equal((await fetch(`${host.address}/health/ready`)).status, 503);
  } finally { await host.stop(); }
});
test('必需名单格式错误不创建运行时；不存在的必需插件在资源申请前收尾并报告失败', async () => {
  let created = 0; let acquired = 0;
  const options = { ...fixture(), createRuntime() { created++; return createRuntime(); } };
  await assert.rejects(openHost({ ...options, requiredPluginIds: ['fixture', 'fixture'] }, { platform: 'node', capabilities: [] }, () => { acquired++; }), /名单无效/);
  assert.equal(created, 0);
  await assert.rejects(openHost({ ...options, requiredPluginIds: ['missing'] }, { platform: 'node', capabilities: [] }, () => { acquired++; }), error => {
    assert.ok(error instanceof HostStartError); assert.equal(error.host.inspect().state, 'stopped'); return true;
  });
  assert.equal(acquired, 0);
});

test('真实 HTTP：就绪、两实例隔离、健康端点不泄漏配置和幂等关闭', async () => {
  let cleanup = 0;
  const first = await startNodeHost({ ...fixture(scope => { scope.onDispose(() => { cleanup++; }); }),
    routes: [{ path: '/ping', handle: () => ({ value: 'first' }) }] });
  const second = await startNodeHost({ ...fixture(), routes: [{ path: '/ping', handle: () => ({ value: 'second' }) }] });
  try {
    assert.notEqual(first.address, second.address);
    assert.deepEqual(await (await fetch(`${first.address}/health/ready`)).json(), { ready: true });
    assert.deepEqual(await (await fetch(`${first.address}/ping`)).json(), { value: 'first' });
    assert.deepEqual(await (await fetch(`${second.address}/ping`)).json(), { value: 'second' });
    assert.equal(first.stop(), first.stop());
    assert.equal((await first.completion()).state, 'stopped');
    assert.equal(cleanup, 1);
    await assert.rejects(fetch(`${first.address}/ping`));
    assert.equal((await fetch(`${second.address}/ping`)).status, 200);
  } finally { await first.stop(); await second.stop(); }
});

test('先排空真实进行中的请求，再清理插件；新请求不再接入', async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let disposed = false;
  const host = await startNodeHost({ ...fixture(scope => { scope.onDispose(() => { disposed = true; }); }),
    routes: [{ path: '/slow', async handle() { entered.resolve(); await release.promise; return { disposed }; } }] });
  const response = fetch(`${host.address}/slow`);
  await entered.promise;
  const closing = host.stop();
  assert.equal(host.inspect().state, 'stopping');
  assert.equal(disposed, false);
  try { const later = await fetch(`${host.address}/health/ready`); assert.equal(later.status, 503); }
  catch (error) { assert.ok(error instanceof TypeError); }
  release.resolve();
  assert.deepEqual(await (await response).json(), { disposed: false });
  assert.equal((await closing).state, 'stopped');
  assert.equal(disposed, true);
});

test('监听失败回收新运行时，不影响占用端口的另一个宿主', async () => {
  const first = await startNodeHost(fixture());
  let disposed = 0;
  try {
    await assert.rejects(startNodeHost({ ...fixture(scope => { scope.onDispose(() => { disposed++; }); }),
      port: Number(new URL(first.address).port) }), (error: unknown) => {
      assert.ok(error instanceof HostStartError);
      assert.equal(error.shutdown.state, 'stopped'); return true;
    });
    assert.equal(disposed, 1);
    assert.equal((await fetch(`${first.address}/health/ready`)).status, 200);
  } finally { await first.stop(); }
});

test('HTTP 配置和路径冲突在激活前拒绝；处理器错误不回传内部消息', async () => {
  let touched = 0;
  for (const change of [{ port: -1 }, { routes: [{ path: '/health/ready', handle() {} }] }]) {
    await assert.rejects(startNodeHost({ ...fixture(() => { touched++; }), ...change }));
  }
  assert.equal(touched, 0);
  const host = await startNodeHost({ ...fixture(), routes: [{ path: '/fail', handle() { throw new Error('secret-token'); } }] });
  try {
    const response = await fetch(`${host.address}/fail`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'internal-error' });
  } finally { await host.stop(); }
});

test('就绪由当前运行时审计决定，不冻结为启动成功', async () => {
  let runtime: Runtime | undefined;
  const host = await startNodeHost({ ...fixture(), createRuntime() { const created = createRuntime(); runtime = created; return created; } });
  try {
    runtime!.load({ id: 'late-failure', setup() { throw new Error('activation failed'); } });
    await runtime!.settle();
    assert.equal(host.inspect().state, 'not-ready');
    assert.equal((await fetch(`${host.address}/health/ready`)).status, 503);
  } finally { await host.stop(); }
});

test('关闭超时是有界观察，实际 HTTP 请求和资源责任保留到完成', async () => {
  const entered = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>();
  const host = await startNodeHost({ ...fixture(), shutdownTimeoutMs: 10,
    routes: [{ path: '/slow', async handle() { entered.resolve(); await release.promise; return {}; } }] });
  const request = fetch(`${host.address}/slow`); await entered.promise;
  assert.equal((await host.stop()).state, 'timed-out');
  assert.equal(host.inspect().state, 'timed-out');
  release.resolve(); await request;
  assert.equal((await host.completion()).state, 'stopped');
});

test('宿主资源释放失败仍清理插件，并报告 cleanup-failed', async () => {
  let cleaned = false;
  const host = await openHost(fixture(scope => { scope.onDispose(() => { cleaned = true; }); }),
    { platform: 'node', capabilities: [] }, context => { context.onRelease(() => { throw new Error('release'); }); });
  assert.equal((await host.stop()).state, 'cleanup-failed');
  assert.equal(cleaned, true);
});

test('资源申请失败有真实回收报告；插件激活失败不申请宿主资源', async () => {
  let released = 0;
  await assert.rejects(openHost(fixture(), { platform: 'node', capabilities: [] }, context => {
    context.onRelease(() => { released++; }); throw new Error('acquire');
  }), HostStartError);
  assert.equal(released, 1);
  await assert.rejects(openHost(fixture(() => { throw new Error('plugin'); }), { platform: 'node', capabilities: [] }, () => { released++; }));
  assert.equal(released, 1);
});

test('信号监听显式订阅与撤销，没有导入副作用', async () => {
  const baseline = process.listenerCount('SIGTERM');
  const host = await startNodeHost(fixture());
  const dispose = bindProcessSignals(host, () => {});
  assert.equal(process.listenerCount('SIGTERM'), baseline + 1);
  dispose(); dispose();
  assert.equal(process.listenerCount('SIGTERM'), baseline);
  assert.equal(host.inspect().state, 'ready'); await host.stop();
});

test('独立 Node 进程信号事件触发关闭并自然退出，不依赖 process.exit', () => {
  const result = spawnSync(process.execPath, ['tests/signal-fixture.mjs'], { cwd: import.meta.dirname + '/..',
    windowsHide: true, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /stopped/);
});

test('资源申请失败而关闭超时，错误仍携带可观察的真实收尾句柄', async () => {
  const released = Promise.withResolvers<void>();
  try {
    await openHost({ ...fixture(), shutdownTimeoutMs: 10 }, { platform: 'node', capabilities: [] }, context => {
      context.onRelease(() => released.promise); throw new Error('startup');
    });
    assert.fail('应拒绝启动');
  } catch (error) {
    assert.ok(error instanceof HostStartError);
    assert.equal(error.shutdown.state, 'timed-out');
    released.resolve();
    assert.equal((await error.host.completion()).state, 'stopped');
  }
});

test('宿主清理回调重入 stop 仍共享已登记的句柄', async () => {
  let host: Awaited<ReturnType<typeof openHost>>;
  let reentered: ReturnType<typeof host.stop> | undefined;
  let releases = 0;
  host = await openHost(fixture(), { platform: 'node', capabilities: [] }, context => {
    context.onRelease(() => { releases++; reentered = host.stop(); });
  });
  const first = host.stop();
  assert.equal(first, reentered);
  assert.equal((await first).state, 'stopped');
  assert.equal(releases, 1);
});

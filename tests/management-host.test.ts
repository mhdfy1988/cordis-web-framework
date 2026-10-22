import assert from 'node:assert/strict';
import test from 'node:test';
import { startNodeHost } from '../src/hosts/node/index.ts';
import { createCordisRuntime } from '../src/runtime-cordis/index.ts';
import { createMemoryPluginStore } from '../src/plugin-management/memory-store.ts';
import { createNodePluginLoader } from '../src/hosts/node/plugin-loader.ts';
import { artifactIntegrity } from '../src/plugin-management/artifact.ts';
import { createJsonEndpointRegistry, createStaticAssetRegistry } from '../src/http-json/registry.ts';

test('P5 真实宿主：动态接口撤销、可选停用不影响就绪、复用 HTTP 协议及幂等关闭', async () => {
  const registry = createJsonEndpointRegistry();
  const assets = createStaticAssetRegistry();
  const builtin = { manifest: { id: 'http-foundation', version: '1.0.0', apiVersion: '^1', requires: [], provides: [{ id: 'framework.http', version: '1.0.0' }] },
    prepare: () => ({ ok: true as const, value(scope: { provide(key: { id: string }, value: unknown): void }) { scope.provide({ id: 'framework.http' }, { ...registry, assets }); } }) };
  const host = await startNodeHost({ document: { formatVersion: 1, plugins: [], bindings: {} }, catalog: new Map(), createRuntime: createCordisRuntime,
    dynamicApi: registry, dynamicAssets: assets, management: { store: createMemoryPluginStore(), loader: createNodePluginLoader(), builtins: [{ plugin: builtin, required: true }] } });
  try {
    const content = { formatVersion: 1 as const, manifest: { id: 'endpoint', version: '1.0.0', apiVersion: '^1',
      requires: [{ id: 'framework.http', range: '^1' }], provides: [] }, entries: { node: `export default manifest => ({manifest,prepare:()=>({ok:true,value(scope){
        const api=scope.get({id:'framework.http'}); scope.onDispose(api.register({method:'GET',path:'/extensions/hello',async execute(){return {message:'动态接口'}}}));
        scope.onDispose(api.assets.register({path:'/plugin-assets/hello.css',contentType:'text/css; charset=utf-8',content:'.hello { color: red; }'}));
      }})})` }, assets: [] };
    const artifact = { ...content, integrity: await artifactIntegrity(content) };
    await host.management!.install(artifact, { acceptedIntegrity: artifact.integrity, bindings: { 'framework.http': 'http-foundation' } });
    await host.management!.enable('endpoint');
    const response = await fetch(host.address + '/extensions/hello', { headers: { 'x-framework-api': '1' } });
    assert.equal((await response.json()).data.message, '动态接口');
    assert.equal(await (await fetch(host.address + '/plugin-assets/hello.css')).text(), '.hello { color: red; }');
    await host.management!.disable('endpoint');
    assert.equal((await fetch(host.address + '/extensions/hello', { headers: { 'x-framework-api': '1' } })).status, 404);
    assert.equal((await fetch(host.address + '/plugin-assets/hello.css')).status, 404);
    assert.equal((await fetch(host.address + '/health/ready')).status, 200);
    await assert.rejects(host.management!.disable('http-foundation'), /必需/);
    await host.management!.uninstall('endpoint'); assert.equal(registry.inspect().endpoints, 0);
  } finally { assert.equal((await host.stop()).state, 'stopped'); }
});
test('P5 动态端点先拒绝新请求，撤销等待真实在途处理器', async () => {
  const registry = createJsonEndpointRegistry(); const finish = Promise.withResolvers<unknown>();
  const dispose = registry.register({ method: 'GET', path: '/extensions/slow', execute: async () => finish.promise });
  const context = { requestId: 'test', signal: new AbortController().signal, logger: { log() {}, child() { return this; }, async flush() {} } };
  const request = registry.execute('GET', '/extensions/slow', context, {});
  let released = false; const removing = Promise.resolve(dispose()).then(() => { released = true; });
  await assert.rejects(registry.execute('GET', '/extensions/slow', context, {})); assert.equal(released, false);
  finish.resolve({ done: true }); await request; await removing; assert.equal(released, true);
});

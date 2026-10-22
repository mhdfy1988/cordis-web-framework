import assert from 'node:assert/strict';
import { startNodeHost } from 'cordis-web-framework/hosts/node';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';

const secret = 'W2_SERVER_ONLY_SECRET';
let active = false;
const plugin = { manifest: { id: 'node-test', version: '1.0.0', apiVersion: '^1', requires: [], provides: [],
  host: { platforms: ['node'], capabilities: ['http'] } }, prepare: () => ({ ok: true, value(scope) {
  active = true;
  // 秘密由服务端闭包持有，不放入健康端点、共享配置或浏览器入口。
  assert.ok(secret); scope.onDispose(() => { active = false; });
} }) };
const host = await startNodeHost({ document: { formatVersion: 1, plugins: [{ id: 'node-test', version: '1.0.0', entry: 'node-test' }], bindings: {} },
  catalog: new Map([['node-test', plugin]]), createRuntime: createCordisRuntime });
try {
  assert.equal(active, true);
  const result = await (await fetch(`${host.address}/health/ready`)).text();
  assert.equal(result.includes(secret), false);
  assert.deepEqual(JSON.parse(result), { ready: true });
} finally { assert.equal((await host.stop()).state, 'stopped'); }
assert.equal(active, false);
console.log('W2 独立包 Node 宿主通过');

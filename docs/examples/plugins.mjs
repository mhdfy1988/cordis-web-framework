import assert from 'node:assert/strict';
import { z } from 'zod';
import { service } from 'cordis-web-framework';
import { definePlugin, validateComposition, assembleComposition } from 'cordis-web-framework/composition';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { createShutdownController } from 'cordis-web-framework/shutdown';

const greeting = service('tutorial.greeting');
let released = 0; let answer;
const provider = definePlugin({
  manifest: { id: 'greeting', version: '1.0.0', apiVersion: '^1', requires: [], provides: [{ id: greeting.id, version: '1.0.0' }] },
  config: zodConfig(z.strictObject({ prefix: z.string().min(1) })),
  setup(scope, config) {
    scope.onDispose(() => { released++; });
    scope.provide(greeting, { greet: name => `${config.prefix}，${name}` });
  },
});
const reader = definePlugin({
  manifest: { id: 'reader', version: '1.0.0', apiVersion: '^1', requires: [{ id: greeting.id, range: '^1' }], provides: [] },
  config: zodConfig(z.strictObject({}).default({})),
  setup(scope) { answer = scope.get(greeting).greet('小林'); },
});
const catalog = new Map([['reader', reader], ['greeting', provider]]);
const document = { formatVersion: 1, plugins: [
  { id: 'reader', version: '1.0.0', entry: 'reader' },
  { id: 'greeting', version: '1.0.0', entry: 'greeting', config: { prefix: '你好' } },
], bindings: { [greeting.id]: 'greeting' } };
const rejected = validateComposition({ ...document, bindings: {} }, catalog);
assert.equal(rejected.ok, false);
assert.ok(rejected.issues.some(issue => issue.code === 'missing-binding'));
assert.equal(released, 0);
console.log('错误绑定：', rejected.issues[0].code);
const runtime = await assembleComposition(document, catalog, { createRuntime: createCordisRuntime });
try { assert.equal(answer, '你好，小林'); assert.equal(runtime.audit().ready, true); console.log(answer, '就绪：', runtime.audit().ready); }
finally { assert.equal((await createShutdownController(runtime).stop()).state, 'stopped'); }
await runtime.close(); assert.equal(released, 1); console.log('清理次数：', released);

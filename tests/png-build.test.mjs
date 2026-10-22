import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPngInputs } from '../scripts/png-build.mjs';
test('W5 产物门禁：实际导入图的合法例和禁止项均被正确判断', () => {
  const good = ['app/main.ts', 'node_modules/cordis-web-framework/dist/presentation-vue/index.js'];
  assert.doesNotThrow(() => checkPngInputs(good));
  for (const file of ['node_modules/cordis-web-framework/src/index.ts', 'node_modules/cordis-web-framework/dist/hosts/node/index.js',
    'node_modules/cordis-web-framework/dist/http-json/index.js', 'node_modules/fastify/index.js', 'node_modules/vue-router/index.js', 'records/editor.ts', 'node:fs']) {
    assert.throws(() => checkPngInputs([...good, file]));
  }
  assert.throws(() => checkPngInputs(['app/main.ts']), /tarball/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { root } from '../scripts/run.mjs';
import { renderReference } from '../scripts/reference-model.mjs';
test('参考生成器通过公开转导出，拒绝没有文档覆盖的新入口', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'cordis-reference-'));
  mkdirSync(resolve(directory, 'dist')); mkdirSync(resolve(directory, 'docs/reference'), { recursive: true });
  const pkg = { name: 'fixture', exports: { '.': { types: './dist/index.d.ts' } } };
  writeFileSync(resolve(directory, 'package.json'), JSON.stringify(pkg));
  writeFileSync(resolve(directory, 'dist/index.d.ts'), "export { type Value, read } from './value.js';");
  writeFileSync(resolve(directory, 'dist/value.d.ts'), 'export interface Value { readonly n: number }\nexport declare function read(value: Value): number;');
  writeFileSync(resolve(directory, 'docs/reference/index.md'), '`fixture`');
  const result = renderReference(directory); assert.deepEqual(result.inventory['.'], ['read', 'Value']);
  assert.match(result.markdown, /readonly n: number/); assert.match(result.markdown, /read\(value: Value\): number/);
  pkg.exports['./new'] = pkg.exports['.']; writeFileSync(resolve(directory, 'package.json'), JSON.stringify(pkg));
  assert.throws(() => renderReference(directory), /未覆盖入口/);
});
test('已保存的参考签名与本次公开声明一致', () => {
  assert.equal(readFileSync(resolve(root, 'docs/reference/signatures.md'), 'utf8'), renderReference(root).markdown);
});

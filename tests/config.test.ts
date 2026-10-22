import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { resolveConfiguration } from 'cordis-web-framework/config';
import { zodConfig } from 'cordis-web-framework/validation-zod';

const validator = zodConfig(z.strictObject({ port: z.number().int(),
  nested: z.strictObject({ enabled: z.boolean() }), label: z.string().default('default') }));
const defaults = { id: 'default-source', kind: 'defaults', values: { port: 3000, nested: { enabled: false } } };

test('配置：固定优先级与同级后者覆盖，来源顺序不冒充优先级，默认字段可诊断', () => {
  const winning = { enabled: true };
  const result = resolveConfiguration([
    { id: 'override', kind: 'override', values: { port: 5000 } }, defaults,
    { id: 'environment', kind: 'environment', values: { port: 4000 } },
    { id: 'file-1', kind: 'file', values: { nested: winning } },
    { id: 'file-2', kind: 'file', values: { port: 3500 } },
  ], validator);
  if (!result.ok) assert.fail(JSON.stringify(result.issues));
  assert.deepEqual(result.value.value, { port: 5000, nested: { enabled: true }, label: 'default' });
  assert.deepEqual(result.value.origins, { port: 'override', nested: 'file-1', label: 'schema-default' });
  assert.deepEqual(result.value.sources.map(source => source.id), ['default-source', 'file-1', 'file-2', 'environment', 'override']);
  assert.equal(Object.isFrozen(result.value.value.nested), true);
  winning.enabled = false;
  assert.equal(result.value.value.nested.enabled, true);
  assert.throws(() => { (result.value.value.nested as { enabled: boolean }).enabled = false; }, TypeError);
});

test('配置：顶层字段整体替换，不用隐式深合并掩盖不完整输入', () => {
  const result = resolveConfiguration([defaults, { id: 'file', kind: 'file', values: { nested: {} } }], validator);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.issues[0].path, ['config', 'nested', 'enabled']);
});

test('配置：重复来源、未知来源类型、非 JSON 和原型字段显式拒绝', () => {
  for (const input of [[defaults, defaults], [{ id: 'x', kind: 'mystery', values: {} }],
    [{ id: 'x', kind: 'file', values: { bad() {} } }],
    JSON.parse('[{"id":"x","kind":"file","values":{"__proto__":{}}}]')]) {
    assert.equal(resolveConfiguration(input, validator).ok, false);
  }
});

test('配置：验证器抛错或返回非 JSON 不泄露为未处理异常，来源快照不复制秘密', () => {
  const input = [{ id: 'secret-source', kind: 'override', values: { secret: 'sensitive-value' } }];
  for (const custom of [
    { validate() { throw new Error('expected'); } },
    { validate() { return { ok: true as const, value: { date: new Date() } }; } },
  ]) assert.equal(resolveConfiguration(input, custom).ok, false);
  const result = resolveConfiguration(input, zodConfig(z.strictObject({ secret: z.string() })));
  if (!result.ok) assert.fail('合法秘密配置应可解析，但不进入来源元数据');
  assert.equal(JSON.stringify(result.value.sources).includes('sensitive-value'), false);
});

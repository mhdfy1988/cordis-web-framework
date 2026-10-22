import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { assembleComposition, validateComposition, CompositionRejectedError, CompositionStartError,
  definePlugin } from 'cordis-web-framework/composition';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { matchesVersion } from 'cordis-web-framework/version-semver';
import type { CompositionIssue, RegisteredPlugin } from 'cordis-web-framework/contracts/composition';
import { createCompositionFixture, metadata, numberService, plugin } from './fixtures.ts';

const options = { timeout: 5000 };
function withoutProviderConfig(document: ReturnType<typeof createCompositionFixture>['document']) {
  return { ...document, plugins: document.plugins.map(entry => {
    if (entry.entry !== 'provider') return entry;
    const { config: _config, ...replacement } = entry;
    return replacement;
  }) };
}
async function rejectBeforeRuntime(document: unknown, catalog: ReadonlyMap<string, RegisteredPlugin>, code: CompositionIssue['code'], apiVersion?: string) {
  let created = 0;
  await assert.rejects(assembleComposition(document, catalog, {
    apiVersion, createRuntime() { created++; return createCordisRuntime(); },
  }), error => error instanceof CompositionRejectedError && error.issues.some(issue => issue.code === code));
  assert.equal(created, 0, '无效方案不得先创建运行时或激活部分插件');
}

test('清单：合法 JSON 经真实运行时装配，消费者先声明也能绑定服务并按顺序清理', options, async () => {
  const fixture = createCompositionFixture();
  const runtime = await assembleComposition(JSON.stringify(fixture.document), fixture.catalog, { createRuntime: createCordisRuntime });
  try {
    assert.equal(runtime.audit().ready, true);
    assert.deepEqual(fixture.values, [7]);
    assert.deepEqual(fixture.calls, ['provider', 'consumer']);
    assert.equal(fixture.resources.size, 1);
  } finally { await runtime.close(); }
  assert.deepEqual(fixture.calls.slice(-2), ['consumer:stopped:7', 'provider:stopped']);
  assert.equal(fixture.resources.size, 0);
});

test('清单：只预检不会激活，计划和嵌套数据不可写，输入变化不篡改已检查快照', options, () => {
  const fixture = createCompositionFixture();
  const result = validateComposition(fixture.document, fixture.catalog);
  assert.equal(result.ok, true);
  assert.deepEqual(fixture.calls, []);
  if (!result.ok) return;
  assert.equal(Object.isFrozen(result.plan.plugins[1].provides), true);
  assert.equal(Object.isFrozen(result.plan.bindings), true);
  (fixture.document.bindings as Record<string, string>)[numberService.id] = 'changed';
  assert.equal(result.plan.bindings[numberService.id], 'example/provider');
  assert.throws(() => { (result.plan.plugins as unknown[]).push({}); }, TypeError);
  assert.equal('prepared' in result, false, '预检结果不能泄露可绕过复核的激活函数');
});

test('清单：重复身份在激活前拒绝，错误精确到第二个插件', options, async () => {
  const fixture = createCompositionFixture();
  const document = { ...fixture.document, plugins: [...fixture.document.plugins, fixture.document.plugins[0]] };
  await rejectBeforeRuntime(document, fixture.catalog, 'duplicate-plugin');
  assert.deepEqual(fixture.calls, []);
  const result = validateComposition(document, fixture.catalog);
  if (result.ok) assert.fail('应拒绝重复插件');
  const issue = result.issues.find(issue => issue.code === 'duplicate-plugin')!;
  assert.deepEqual(issue.path, ['plugins', 2, 'id']);
  assert.equal(Object.isFrozen(issue.path), true);
});

for (const [name, document] of [
  ['损坏 JSON', '{"formatVersion":'], ['未知格式', { formatVersion: 2, plugins: [], bindings: {} }],
  ['未知字段', { formatVersion: 1, plugins: [], bindings: {}, typo: true }],
  ['非 JSON 配置', { formatVersion: 1, plugins: [{ id: 'x', version: '1.0.0', entry: 'x', config: { fn() {} } }], bindings: {} }],
] as const) {
  test(`清单：${name} 不被静默忽略`, options, async () => {
    await rejectBeforeRuntime(document, new Map(), 'invalid-document');
  });
}

test('清单：入口只从可信目录取值，不将 URL 或磁盘路径解释为可执行模块', options, async () => {
  const fixture = createCompositionFixture();
  const document = { ...fixture.document, plugins: [{ id: 'x', version: '1.0.0', entry: 'https://example.invalid/plugin.js' }] };
  await rejectBeforeRuntime(document, fixture.catalog, 'module-not-found');
});

test('清单：身份、精确实现版本和宿主 API 版本分别检查', options, async () => {
  const fixture = createCompositionFixture();
  await rejectBeforeRuntime({ ...fixture.document, plugins: [{ ...fixture.document.plugins[0], id: 'other' }] }, fixture.catalog, 'identity-mismatch');
  for (const version of ['2.0.0', '^1.0.0', 'v1.0.0']) {
    await rejectBeforeRuntime({ ...fixture.document, plugins: [{ ...fixture.document.plugins[0], version }] }, fixture.catalog, 'implementation-mismatch');
  }
  await rejectBeforeRuntime(fixture.document, fixture.catalog, 'host-incompatible', '2.0.0');
  await rejectBeforeRuntime(fixture.document, fixture.catalog, 'invalid-host-version', '^1.0.0');
});

test('清单：宿主和服务的预发布版本默认不冒充稳定版本', options, async () => {
  const fixture = createCompositionFixture();
  await rejectBeforeRuntime(fixture.document, fixture.catalog, 'host-incompatible', '1.0.0-rc.1');
  fixture.catalog.set('provider', plugin(metadata('example/provider', { provides: [{ id: numberService.id, version: '1.2.0-rc.1' }] })));
  await rejectBeforeRuntime(withoutProviderConfig(fixture.document), fixture.catalog, 'service-incompatible');
  assert.equal(matchesVersion('1.2.0-rc.1', '^1.2.0-rc.1'), true);
});

test('清单：配置错误带完整字段路径，另一合法插件也不能先启动', options, async () => {
  const fixture = createCompositionFixture();
  const document = { ...fixture.document, plugins: [fixture.document.plugins[0], { ...fixture.document.plugins[1], config: { value: 'wrong' } }] };
  await rejectBeforeRuntime(document, fixture.catalog, 'config-invalid');
  assert.deepEqual(fixture.calls, []);
  const result = validateComposition(document, fixture.catalog);
  if (result.ok) assert.fail('应拒绝错误配置');
  assert.deepEqual(result.issues[0].path, ['plugins', 1, 'config', 'value']);
});

test('清单：缺省配置由模块 schema 补全，跨激活的配置快照保持不可写', options, async () => {
  let frozen = false;
  let configured = 0;
  const module = definePlugin({ manifest: metadata('configured'),
    config: zodConfig(z.strictObject({ nested: z.strictObject({ amount: z.number() }) }).default({ nested: { amount: 9 } })),
    setup(_scope, config) { frozen = Object.isFrozen(config.nested); configured = config.nested.amount; },
  });
  const runtime = await assembleComposition({ formatVersion: 1, plugins: [{ id: 'configured', version: '1.0.0', entry: 'configured' }], bindings: {} },
    new Map([['configured', module]]), { createRuntime: createCordisRuntime });
  await runtime.close();
  assert.equal(frozen, true);
  assert.equal(configured, 9);
});

test('清单：缺失绑定、绑定错误提供者、多个提供者、重复能力都在激活前拒绝', options, async () => {
  const fixture = createCompositionFixture();
  await rejectBeforeRuntime({ ...fixture.document, bindings: {} }, fixture.catalog, 'missing-binding');
  await rejectBeforeRuntime({ ...fixture.document, bindings: { [numberService.id]: 'example/consumer' } }, fixture.catalog, 'invalid-binding');
  await rejectBeforeRuntime({ ...fixture.document, bindings: { missing: 'example/provider' } }, fixture.catalog, 'invalid-binding');
  fixture.catalog.set('other', plugin(metadata('other', { provides: [{ id: numberService.id, version: '1.0.0' }] })));
  await rejectBeforeRuntime({ ...fixture.document, plugins: [...fixture.document.plugins, { id: 'other', version: '1.0.0', entry: 'other' }] }, fixture.catalog, 'duplicate-service');
  fixture.catalog.set('provider', plugin(metadata('example/provider', { provides: [
    { id: numberService.id, version: '1.0.0' }, { id: numberService.id, version: '1.0.0' },
  ] })));
  await rejectBeforeRuntime(withoutProviderConfig(fixture.document), fixture.catalog, 'duplicate-service');
});

test('清单：服务契约版本独立于插件实现版本，不能凭实现版本放行', options, async () => {
  const fixture = createCompositionFixture();
  fixture.catalog.set('provider', plugin(metadata('example/provider', { provides: [{ id: numberService.id, version: '2.0.0' }] })));
  await rejectBeforeRuntime(withoutProviderConfig(fixture.document), fixture.catalog, 'service-incompatible');
  assert.deepEqual(fixture.calls, []);
});

test('清单：两插件循环及自依赖包含可定位环路径，创建运行时前拒绝', options, async () => {
  const a = plugin(metadata('a', { provides: [{ id: 'a-service', version: '1.0.0' }], requires: [{ id: 'b-service', range: '^1.0.0' }] }));
  const b = plugin(metadata('b', { provides: [{ id: 'b-service', version: '1.0.0' }], requires: [{ id: 'a-service', range: '^1.0.0' }] }));
  const document = { formatVersion: 1, plugins: ['a', 'b'].map(id => ({ id, version: '1.0.0', entry: id })), bindings: { 'a-service': 'a', 'b-service': 'b' } };
  const catalog = new Map([['a', a], ['b', b]]);
  await rejectBeforeRuntime(document, catalog, 'dependency-cycle');
  const result = validateComposition(document, catalog);
  if (result.ok) assert.fail('应拒绝依赖环');
  assert.match(result.issues.find(issue => issue.code === 'dependency-cycle')!.message, /a → b → a/);
  const self = plugin(metadata('self', { provides: [{ id: 'self-service', version: '1.0.0' }], requires: [{ id: 'self-service', range: '*' }] }));
  await rejectBeforeRuntime({ formatVersion: 1, plugins: [{ id: 'self', entry: 'self', version: '1.0.0' }], bindings: { 'self-service': 'self' } }, new Map([['self', self]]), 'dependency-cycle');
});

test('清单：合法菱形共享依赖不是循环，不受输入排列顺序影响', options, async () => {
  const manifests = [
    metadata('root', { provides: [{ id: 'root-service', version: '1.0.0' }] }),
    metadata('left', { requires: [{ id: 'root-service', range: '*' }], provides: [{ id: 'left-service', version: '1.0.0' }] }),
    metadata('right', { requires: [{ id: 'root-service', range: '*' }], provides: [{ id: 'right-service', version: '1.0.0' }] }),
    metadata('last', { requires: [{ id: 'left-service', range: '*' }, { id: 'right-service', range: '*' }] }),
  ];
  const catalog = new Map(manifests.map(manifest => [manifest.id, plugin(manifest)]));
  const document = { formatVersion: 1, plugins: manifests.toReversed().map(manifest => ({ id: manifest.id, entry: manifest.id, version: '1.0.0' })),
    bindings: { 'root-service': 'root', 'left-service': 'left', 'right-service': 'right' } };
  assert.equal(validateComposition(document, catalog).ok, true);
});

test('清单：模块清单结构、无效服务范围和重复消费声明不能绕过校验', options, async () => {
  const fixture = createCompositionFixture();
  for (const requires of [[{ id: numberService.id, range: 'not-a-range' }], [
    { id: numberService.id, range: '^1.0.0' }, { id: numberService.id, range: '^1.0.0' },
  ]]) {
    fixture.catalog.set('consumer', plugin(metadata('example/consumer', { requires })));
    await rejectBeforeRuntime(fixture.document, fixture.catalog,
      requires.length === 1 ? 'invalid-manifest' : 'duplicate-requirement');
  }
  fixture.catalog.set('consumer', plugin(metadata('example/consumer', { apiVersion: 'garbage' })));
  await rejectBeforeRuntime(fixture.document, fixture.catalog, 'host-incompatible');
  fixture.catalog.set('consumer', { ...plugin(metadata('example/consumer')),
    manifest: { ...metadata('example/consumer'), typo: true } } as RegisteredPlugin);
  await rejectBeforeRuntime(fixture.document, fixture.catalog, 'invalid-manifest');
});

test('清单：配置验证抛错或转换为非 JSON 数据时仍在激活前拒绝', options, async () => {
  for (const schema of [z.unknown().transform(() => new Date()), z.unknown().transform(() => { throw new Error('配置验证失败'); })]) {
    const module = definePlugin({ manifest: metadata('bad-config'), config: zodConfig(schema), setup() { assert.fail('不能激活'); } });
    await rejectBeforeRuntime({ formatVersion: 1, plugins: [{ id: 'bad-config', entry: 'bad-config', version: '1.0.0' }], bindings: {} },
      new Map([['bad-config', module]]), 'config-invalid');
  }
});

test('清单：独立预检不授予后续跳过复核的权限', options, async () => {
  const fixture = createCompositionFixture();
  assert.equal(validateComposition(fixture.document, fixture.catalog).ok, true);
  (fixture.document.bindings as Record<string, string>)[numberService.id] = 'missing';
  await rejectBeforeRuntime(fixture.document, fixture.catalog, 'invalid-binding');
  assert.deepEqual(fixture.calls, []);
});

test('清单：同契约的第二个实现可替换，消费者代码不变', options, async () => {
  const fixture = createCompositionFixture();
  fixture.catalog.set('replacement', definePlugin({ manifest: metadata('example/replacement', {
    version: '2.3.0', provides: [{ id: numberService.id, version: '1.4.0' }],
  }), config: zodConfig(z.strictObject({}).default({})), setup(scope) { scope.provide(numberService, { read: () => 100 }); } }));
  const document = { ...fixture.document,
    plugins: [fixture.document.plugins[0], { id: 'example/replacement', entry: 'replacement', version: '2.3.0' }],
    bindings: { [numberService.id]: 'example/replacement' } };
  const runtime = await assembleComposition(document, fixture.catalog, { createRuntime: createCordisRuntime });
  await runtime.close();
  assert.deepEqual(fixture.values, [100]);
});

test('清单：真实激活失败与预检拒绝分开，关闭整个新运行时并保留诊断', options, async () => {
  const fixture = createCompositionFixture();
  fixture.catalog.set('broken', plugin(metadata('broken'), () => { throw new Error('预期激活错误'); }));
  const document = { ...fixture.document, plugins: [...fixture.document.plugins, { id: 'broken', entry: 'broken', version: '1.0.0' }] };
  await assert.rejects(assembleComposition(document, fixture.catalog, { createRuntime: createCordisRuntime }), error => {
    assert.ok(error instanceof CompositionStartError);
    assert.equal(error.snapshot.closed, true);
    assert.ok(error.snapshot.diagnostics.some(item => item.pluginId === 'broken' && item.message === '预期激活错误'));
    return true;
  });
  assert.equal(fixture.resources.size, 0);
});

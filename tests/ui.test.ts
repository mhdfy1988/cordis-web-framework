import assert from 'node:assert/strict';
import test from 'node:test';
import { createUiRegistry, UiError, type UiContribution, type UiKind } from '../src/ui-registry/index.ts';
import { createCommandRegistry } from '../src/commands/index.ts';
import { createCordisRuntime } from '../src/runtime-cordis/index.ts';
import { service } from '../src/contracts/runtime.ts';
const context = { scope: 'root' as const, props: {} };
const spec = <T extends string = 'root'>(id: string, target: T = 'root' as T, extra: Partial<Omit<UiContribution, 'target'>> = {}): UiContribution & { target: T } => ({ id, target, range: '^1', renderer: 'vue', view: id, ...extra });
function fixture(kind: UiKind, scope: 'root' | 'session' | 'session-maybe' = 'root') {
  const ui = createUiRegistry();
  const owner = ui.register(spec('layout', 'root', { children: [{ name: 'content', kind, scope, version: '1.0.0' }] }));
  const resolve = (key?: string) => ui.resolve('content', context, { access: owner.children, entryKey: key });
  return { ui, owner, resolve };
}

test('单项：优先级显式覆盖、同级冲突、故障退出与耗尽错误，不回退旧逻辑', () => {
  const { ui, resolve } = fixture('single');
  const first = ui.registerDynamic(spec('a', 'content', { priority: 10 }));
  const second = ui.registerDynamic(spec('b', 'content', { priority: -1 }));
  assert.throws(() => ui.registerDynamic(spec('c', 'content', { priority: -1 })), UiError);
  assert.equal(resolve().entries[0].contribution.id, 'b'); ui.fail(second.instance);
  assert.equal(resolve().entries[0].contribution.id, 'a'); ui.fail(first.instance);
  assert.equal(resolve().failed, true); assert.equal(resolve().entries.length, 0);
  assert.ok(ui.inspect().diagnostics.some(item => item.code === 'render-failed'));
});
test('列表：每个 id 独立竞争、order 稳定排序，某单元故障不吞其他项', () => {
  const { ui, resolve } = fixture('list');
  const a = ui.registerDynamic(spec('a', 'content', { order: 2 }));
  ui.registerDynamic(spec('b', 'content', { order: 1 }));
  ui.registerDynamic(spec('a', 'content', { priority: 2, order: 0 }));
  assert.deepEqual(resolve().entries.map(item => item.contribution.id), ['b', 'a']);
  ui.fail(a.instance); assert.deepEqual(resolve().entries.map(item => item.contribution.id), ['a', 'b']);
  ui.fail(resolve().entries[0].instance); assert.deepEqual(resolve().failedUnits, ['a']);
  assert.equal(resolve().entries[0].contribution.id, 'b');
});
test('键控：按 key 而不是注册 id 竞争，不误选其他键', () => {
  const { ui, resolve } = fixture('keyed');
  ui.registerDynamic(spec('a', 'content', { key: 'editor' }));
  ui.registerDynamic(spec('b', 'content', { key: 'help' }));
  assert.equal(resolve('editor').entries[0].contribution.id, 'a'); assert.equal(resolve('unknown').entries.length, 0);
  assert.throws(() => ui.registerDynamic(spec('c', 'content', { key: 'editor' })), UiError);
});
test('选择链：异常继续、null 跳过、同优先级稳定、matched 传递；组件故障不触发改选', () => {
  const { ui, resolve } = fixture('chain'); let called = 0;
  ui.registerDynamic(spec('throw', 'content', { select() { throw new Error('private'); } }));
  ui.registerDynamic(spec('null', 'content', { select: () => null }));
  const match = ui.registerDynamic(spec('match', 'content', { select: () => ({ value: 1 }) }));
  ui.registerDynamic(spec('later', 'content', { select() { called++; return 2; } }));
  assert.deepEqual(resolve().entries[0].matched, { value: 1 }); assert.equal(called, 0);
  assert.throws(() => ui.fail(match.instance), /选择链/);
  assert.equal(resolve().entries[0].contribution.id, 'match');
  assert.ok(ui.inspect().diagnostics.some(item => item.code === 'selector-failed'));
});
test('选择链拒绝异步选择器，传入只读输入，失败继续可观察而不挂起', async () => {
  const { ui, resolve } = fixture('chain');
  ui.registerDynamic(spec('async', 'content', { select: () => Promise.reject(new Error('private')) }));
  ui.registerDynamic(spec('mutate', 'content', { select(props) { (props as Record<string, unknown>).changed = true; return true; } }));
  ui.registerDynamic(spec('ok', 'content', { select: () => 0 }));
  assert.equal(resolve().entries[0].matched, 0); await Promise.resolve();
  assert.ok(ui.inspect().diagnostics.filter(item => item.code === 'selector-failed').length >= 2);
});
test('声明期：未声明拒绝直接注册，等待随多代布局重建；停止等待后不复活', () => {
  const ui = createUiRegistry(); let mounted = 0; let cleaned = 0;
  assert.throws(() => ui.registerDynamic(spec('a', 'content')), /undeclared/);
  const stop = ui.inject('content', () => { mounted++; const handle = ui.registerDynamic(spec('a', 'content')); return () => { cleaned++; handle.dispose(); }; });
  const layout = () => ui.register(spec('layout', 'root', { children: [{ name: 'content', kind: 'single', scope: 'root', version: '1.0.0' }] }));
  const first = layout(); assert.equal(mounted, 1); first.dispose(); assert.equal(cleaned, 1);
  const second = layout(); assert.equal(mounted, 2); stop(); stop(); assert.equal(cleaned, 2);
  second.dispose(); const third = layout(); assert.equal(mounted, 2); third.dispose();
  assert.deepEqual(ui.inspect().positions, ['root']); assert.equal(ui.inspect().contributions, 0); assert.equal(ui.inspect().waiters, 0);
});
test('声明与来源：重复子位置／版本／伪造令牌原子拒绝，父撤销级联销毁', () => {
  const { ui, owner } = fixture('single'); const before = ui.inspect();
  assert.throws(() => ui.register(spec('other', 'root', { priority: 1, children: [{ name: 'content', kind: 'single', scope: 'root', version: '1.0.0' }] })), /conflict/);
  assert.equal(ui.inspect().contributions, before.contributions);
  assert.throws(() => ui.registerDynamic(spec('bad', 'content', { range: '^2' })), /incompatible/);
  assert.throws(() => ui.resolve('content', context, { access: { owner: owner.instance } }), /unauthorized/);
  const other = fixture('single'); assert.throws(() => ui.resolve('content', context, { access: other.owner.children }), /unauthorized/);
  ui.registerDynamic(spec('child', 'content', { children: [{ name: 'grandchild', kind: 'list', scope: 'root', version: '1.0.0' }] }));
  ui.registerDynamic(spec('last', 'grandchild')); owner.dispose();
  assert.deepEqual(ui.inspect().positions, ['root']); assert.equal(ui.inspect().contributions, 0);
  assert.throws(() => ui.resolve('content', context, { access: owner.children }), /undeclared/);
});
test('会话：严格作用域、候选故障按编辑实例隔离，释放会话可清除故障标记', () => {
  const { ui, owner } = fixture('single', 'session'); const handle = ui.registerDynamic(spec('editor', 'content'));
  const resolve = (sessionId: string) => ui.resolve('content', { scope: 'session', sessionId, props: {} }, { access: owner.children });
  assert.throws(() => ui.resolve('content', context, { access: owner.children }), /scope/);
  assert.throws(() => ui.resolve('root', { scope: 'session', sessionId: 'a', props: {} }), /scope/);
  ui.fail(handle.instance, 'a'); assert.equal(resolve('a').failed, true); assert.equal(resolve('b').failed, false);
  ui.releaseSession('a'); assert.equal(resolve('a').entries.length, 1);
});
test('混合作用域：默认上下文与字面名 @root 的会话故障和释放互不污染', () => {
  const { ui, owner, resolve } = fixture('single', 'session-maybe');
  const handle = ui.registerDynamic(spec('editor', 'content'));
  const named = () => ui.resolve('content', { scope: 'session', sessionId: '@root', props: {} }, { access: owner.children });
  ui.fail(handle.instance);
  assert.equal(resolve().failed, true);
  assert.equal(named().entries.length, 1);
  ui.fail(handle.instance, '@root');
  assert.equal(named().failed, true);
  ui.releaseSession('@root');
  assert.equal(named().entries.length, 1);
  assert.equal(resolve().failed, true, '释放命名会话不能清除默认上下文的故障');
  ui.close();
});

test('观察与关闭：重入变动完成通知，清理异常有诊断且关闭不能重建贡献', () => {
  const ui = createUiRegistry(); let added = false; let observed = 0;
  ui.subscribe(() => { observed++; if (!added) { added = true; ui.register(spec('second', 'root', { priority: 1 })); } });
  ui.register(spec('first')); assert.equal(ui.inspect().contributions, 2); assert.ok(observed >= 2);
  ui.inject('root', () => () => { ui.register(spec('resurrect', 'root', { priority: 2 })); });
  assert.throws(() => ui.close(), /清理失败/); assert.throws(() => ui.close(), /清理失败/);
  assert.equal(ui.inspect().contributions, 0); assert.equal(ui.inspect().waiters, 0);
  assert.ok(ui.inspect().diagnostics.some(item => item.code === 'cleanup-failed'));
  assert.throws(() => ui.register(spec('late')), /关闭/);
});
test('声明清理失败仍释放其他贡献，但不能复用脏注册表或将插件 stop 报为成功', async () => {
  const ui = createUiRegistry(); const runtime = createCordisRuntime();
  const layout = ui.register(spec('layout', 'root', { children: [{ name: 'content', kind: 'single', scope: 'root', version: '1.0.0' }] }));
  ui.inject('content', () => () => { throw new Error('private-cleanup'); });
  const plugin = runtime.load({ id: 'layout', setup(scope) { scope.onDispose(layout.dispose); } });
  await plugin.settle(); assert.equal((await plugin.stop()).state, 'cleanup-failed');
  assert.deepEqual(ui.inspect().positions, ['root']); assert.equal(ui.inspect().contributions, 0);
  assert.throws(() => ui.register(spec('new')), /不可复用/);
  assert.throws(() => ui.close(), /清理失败/); await runtime.close();
});
test('命令：共享启用检查、快捷键冲突、重入去重、停用取消与真实排空', async () => {
  const commands = createCommandRegistry(); let permitted = false; let calls = 0;
  const entered = Promise.withResolvers<void>(); const finish = Promise.withResolvers<void>(); let aborted = false;
  const dispose = commands.register({ id: 'save', label: '保存', shortcut: { key: 's', mod: true }, enabled: () => permitted,
    async run(_context, signal) { calls++; signal.addEventListener('abort', () => { aborted = true; }); entered.resolve(); await finish.promise; } });
  assert.equal(await commands.execute('save', {}), 'disabled'); permitted = true;
  assert.throws(() => commands.register({ id: 'other', label: '其他', shortcut: { key: 's', mod: true }, run() {} }), /快捷键冲突/);
  const task = commands.execute('save', { sessionId: 'a' }); await entered.promise;
  assert.equal(await commands.execute('save', { sessionId: 'a' }), 'busy'); assert.equal(calls, 1);
  dispose(); assert.equal(aborted, true); assert.equal(commands.inspect().running, 1);
  assert.equal(await commands.execute('save', {}), 'missing');
  const closing = commands.close(); assert.equal(closing, commands.close()); finish.resolve();
  assert.equal(await task, 'cancelled'); await closing; assert.equal(commands.inspect().running, 0);
});
test('命令：启用检查重入撤销不能执行旧动作，异常结果可观察且不会永久锁死', async () => {
  const commands = createCommandRegistry(); let calls = 0; let dispose = () => {};
  dispose = commands.register({ id: 'reentrant', label: '重入', enabled() { dispose(); return true; }, run() { calls++; } });
  assert.equal(await commands.execute('reentrant', {}), 'missing'); assert.equal(calls, 0);
  commands.register({ id: 'bad', label: '失败', run() { throw new Error('private'); } });
  assert.equal(await commands.execute('bad', {}), 'failed'); assert.equal(await commands.execute('bad', {}), 'failed');
  assert.equal(commands.inspect().running, 0); assert.deepEqual(commands.inspect().failures, ['bad', 'bad']);
  await commands.close();
});
test('命令所属插件 stop 必须等待取消后的真实动作收尾，不能留下运行残留', async () => {
  const runtime = createCordisRuntime(); const commands = createCommandRegistry();
  const entered = Promise.withResolvers<void>(); const finish = Promise.withResolvers<void>();
  const plugin = runtime.load({ id: 'command-owner', setup(scope) {
    scope.onDispose(commands.register({ id: 'slow', label: '慢动作', async run() { entered.resolve(); await finish.promise; } }));
  } });
  await plugin.settle(); const action = commands.execute('slow', {}); await entered.promise;
  const stopping = plugin.stop(); await Promise.resolve();
  assert.equal(plugin.inspect().state, 'stopping'); assert.equal(commands.inspect().running, 1);
  finish.resolve(); assert.equal((await stopping).state, 'stopped'); assert.equal(await action, 'cancelled');
  assert.equal(commands.inspect().running, 0); assert.equal(commands.inspect().commands, 0);
  await runtime.close(); await commands.close();
});

test('命令启用检查重入同会话仍去重，关闭等待真实动作结束', async () => {
  const commands = createCommandRegistry(); let nested: ReturnType<typeof commands.execute> | undefined; let checks = 0; let calls = 0;
  const entered = Promise.withResolvers<void>(); const finish = Promise.withResolvers<void>();
  commands.register({ id: 'reenter-check', label: '启用重入', enabled() {
    if (++checks === 1) nested = commands.execute('reenter-check', { sessionId: 'same' });
    return true;
  }, async run() { calls++; entered.resolve(); await finish.promise; } });
  const outer = commands.execute('reenter-check', { sessionId: 'same' });
  try {
    await entered.promise;
    assert.equal(checks, 1); assert.equal(calls, 1);
    assert.equal(await nested, 'busy');
    let closed = false; const closing = commands.close().then(() => { closed = true; });
    await Promise.resolve(); assert.equal(closed, false); assert.equal(commands.inspect().running, 1);
    finish.resolve(); assert.equal(await outer, 'cancelled'); await closing;
    assert.equal(commands.inspect().running, 0);
  } finally { finish.resolve(); await Promise.all([outer, nested]); await commands.close(); }
});

test('默认命令会话与名为 @root 的合法会话独立，同名会话仍去重', async () => {
  const commands = createCommandRegistry(); let calls = 0;
  const finish = Promise.withResolvers<void>();
  commands.register({ id: 'sessions', label: '会话隔离', async run() { calls++; await finish.promise; } });
  const root = commands.execute('sessions', {});
  const named = commands.execute('sessions', { sessionId: '@root' });
  try {
    await Promise.resolve(); assert.equal(commands.inspect().running, 2); assert.equal(calls, 2);
    assert.equal(await commands.execute('sessions', {}), 'busy');
    assert.equal(await commands.execute('sessions', { sessionId: '@root' }), 'busy');
    finish.resolve(); assert.deepEqual(await Promise.all([root, named]), ['completed', 'completed']);
  } finally { finish.resolve(); await Promise.all([root, named]); await commands.close(); }
});

test('命令启用检查重入关闭时，不执行动作且关闭不会漏等或死锁', async () => {
  const commands = createCommandRegistry(); let closing: Promise<void> | undefined; let calls = 0;
  commands.register({ id: 'close-check', label: '启用时关闭', enabled() { closing = commands.close(); return true; }, run() { calls++; } });
  assert.equal(await commands.execute('close-check', {}), 'missing'); await closing;
  assert.equal(calls, 0); assert.equal(commands.inspect().running, 0);
});
test('Cordis 公开作用域拥有界面和命令：停用贡献插件不销毁业务服务，重启无残留', async () => {
  const runtime = createCordisRuntime(); const ui = createUiRegistry(); const commands = createCommandRegistry();
  const uiKey = service<typeof ui>('ui'); const commandKey = service<typeof commands>('commands'); const draft = { text: '保留草稿' };
  runtime.load({ id: 'infra', provides: [uiKey, commandKey], setup(scope) { scope.provide(uiKey, ui); scope.provide(commandKey, commands);
    scope.onDispose(() => ui.close()); scope.onDispose(() => commands.close()); } });
  const plugin = () => runtime.load({ id: 'layout', requires: [uiKey, commandKey], setup(scope) {
    scope.onDispose(scope.get(uiKey).register(spec('layout')).dispose);
    scope.onDispose(scope.get(commandKey).register({ id: 'draft', label: '草稿', run() { draft.text += '!'; } }));
  } });
  const first = plugin(); await runtime.settle(); assert.equal(runtime.audit().ready, true);
  await commands.execute('draft', {}); await first.stop(); assert.equal(ui.inspect().contributions, 0); assert.equal(commands.inspect().commands, 0);
  const second = plugin(); await runtime.settle(); assert.equal(draft.text, '保留草稿!');
  await second.stop(); await runtime.close(); assert.equal(ui.inspect().contributions, 0);
});

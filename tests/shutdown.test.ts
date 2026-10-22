import assert from 'node:assert/strict';
import test from 'node:test';
import type { Runtime } from 'cordis-web-framework/runtime';
import type { ShutdownController } from 'cordis-web-framework/shutdown';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { createShutdownController } from 'cordis-web-framework/shutdown';

test('关闭：正常收尾、重复调用共享结果，真实清理只执行一次', { timeout: 5000 }, async () => {
  const runtime = createCordisRuntime();
  let released = 0;
  runtime.load({ id: 'normal', setup(scope) { scope.onDispose(() => { released++; }); } });
  await runtime.settle();
  const shutdown = createShutdownController(runtime);
  assert.equal(shutdown.inspect().state, 'running');
  const first = shutdown.stop();
  assert.equal(shutdown.stop(), first);
  assert.equal((await first).state, 'stopped');
  assert.equal((await shutdown.completion()).state, 'stopped');
  assert.equal(released, 1);
  assert.throws(() => runtime.load({ id: 'new', setup() {} }), /已关闭/);
});

test('关闭：预算到期不冒充已释放；在途清理完成后更新终态，超时快照保持原样', { timeout: 5000 }, async () => {
  const gate = Promise.withResolvers<void>();
  const runtime = createCordisRuntime();
  let held = true;
  runtime.load({ id: 'slow', setup(scope) { scope.onDispose(async () => { await gate.promise; held = false; }); } });
  await runtime.settle();
  const shutdown = createShutdownController(runtime, { timeoutMs: 10 });
  try {
    const report = await shutdown.stop();
    assert.equal(report.state, 'timed-out');
    assert.equal(held, true);
    assert.equal(report.runtime.plugins[0].state, 'stopping');
    assert.equal(runtime.audit().ready, false);
    assert.throws(() => runtime.load({ id: 'replacement', setup() {} }), /已关闭/);
    gate.resolve();
    const final = await shutdown.completion();
    assert.equal(final.state, 'stopped');
    assert.equal(held, false);
    assert.equal(shutdown.inspect().state, 'stopped');
    assert.equal(report.state, 'timed-out');
  } finally { gate.resolve(); await shutdown.completion(); }
});

test('关闭：清理异常可见且其他资源仍释放，不把 Promise 完成当成无错', async () => {
  const runtime = createCordisRuntime();
  let released = false;
  runtime.load({ id: 'bad', setup(scope) {
    scope.onDispose(() => { released = true; });
    scope.onDispose(() => { throw new Error('expected cleanup failure'); });
  } });
  await runtime.settle();
  const shutdown = createShutdownController(runtime);
  const report = await shutdown.stop();
  assert.equal(report.state, 'cleanup-failed');
  assert.equal(released, true);
  assert.ok(report.runtime.diagnostics.some(item => item.message === 'expected cleanup failure'));
});

test('关闭：两个实例隔离，无效预算在触发关闭前拒绝', async () => {
  const first = createCordisRuntime();
  const second = createCordisRuntime();
  try {
    for (const timeoutMs of [0, -1, NaN, 1.5, Infinity, 2 ** 32]) {
      assert.throws(() => createShutdownController(first, { timeoutMs }), TypeError);
      assert.equal(first.inspect().closed, false);
    }
    await createShutdownController(first).stop();
    assert.equal(second.inspect().closed, false);
    assert.equal(second.audit().ready, true);
  } finally { await first.close(); await second.close(); }
});

test('关闭：适配同步抛错或异步拒绝都留有失败结果，不转为后续超时', async () => {
  for (const close of [() => { throw new Error('sync'); }, () => Promise.reject(new Error('async'))]) {
    const runtime = { close, inspect: () => ({ closed: true, plugins: [], diagnostics: [] }) } as unknown as Runtime;
    const shutdown = createShutdownController(runtime, { timeoutMs: 5 });
    assert.equal((await shutdown.stop()).state, 'cleanup-failed');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(shutdown.inspect().state, 'cleanup-failed');
  }
});

test('关闭：取消监听重入 stop 仍共享同一关闭结果，不重复发起底层关闭', async () => {
  const runtime = createCordisRuntime();
  let controller: ShutdownController;
  let nested: ReturnType<ShutdownController['stop']> | undefined;
  runtime.load({ id: 'reentrant', setup(scope) {
    scope.signal.addEventListener('abort', () => { nested = controller.stop(); }, { once: true });
  } });
  await runtime.settle();
  controller = createShutdownController(runtime);
  const outer = controller.stop();
  assert.equal(nested, outer);
  assert.equal((await outer).state, 'stopped');
});

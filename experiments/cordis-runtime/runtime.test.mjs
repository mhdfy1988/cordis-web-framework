import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { createRuntimeFixture } from './fixtures.mjs';
import { assertCordisPatchTarget } from '../../scripts/dependency-patch-policy.mjs';

const options = { timeout: 5000 };
// 数值来自当前固定包公开的 FiberState 声明；不作为产品的状态映射。
const state = { pending: 0, active: 2, failed: 3, disposed: 4 };

test('缺依赖时保持等待，提供服务后才激活消费者', options, async t => {
  const { root, events, resources, ProbeService } = createRuntimeFixture(t);
  const consumer = root.inject(['probe'], ctx => {
    events.push(`consumer:${ctx.probe.read()}:ready`);
    return () => events.push('consumer:closed');
  });
  await consumer.await();
  assert.equal(consumer.state, state.pending);
  assert.deepEqual(events, []);

  await root.plugin(ProbeService);
  await consumer.await();
  assert.equal(consumer.state, state.active);
  assert.deepEqual(events, ['provider:1:ready', 'consumer:1:ready']);
  await root.fiber.dispose();
  assert.equal(resources.size, 0);
  assert.deepEqual(events.slice(-2), ['consumer:closed', 'provider:1:closed']);
});

test('异步激活完成前不执行依赖消费者', options, async t => {
  const { root, resources, gate } = createRuntimeFixture(t);
  const setup = gate();
  let called = 0;
  const consumer = root.inject(['delayed'], ctx => {
    called += ctx.delayed.value;
  });
  const provider = root.plugin(async function* (ctx) {
    resources.add('setup');
    yield () => resources.delete('setup');
    await setup.promise;
    ctx.provide('delayed', { value: 1 });
  });
  await setImmediate();
  assert.equal(called, 0);
  setup.resolve();
  await provider.await();
  await consumer.await();
  assert.equal(called, 1);
  await root.fiber.dispose();
  assert.equal(resources.size, 0);
});

test('激活中抛错会撤销已登记资源和服务，并保留失败证据', options, async t => {
  const { root, resources, errors } = createRuntimeFixture(t, { expectedErrors: 1 });
  const expected = new Error('预期的激活失败');
  const failed = root.plugin(function* (ctx) {
    resources.add('partial');
    yield () => resources.delete('partial');
    ctx.provide('partial', { value: 1 });
    throw expected;
  });
  await assert.rejects(failed.await(), error => error === expected);
  assert.equal(failed.state, state.failed);
  assert.equal(resources.size, 0);
  assert.equal(root.get('partial'), undefined);
  assert.ok(errors.some(args => args.includes(expected)));
});

test('停用提供者要等消费者异步清理，清理期间仍可访问依赖', options, async t => {
  const { root, events, resources, gate, ProbeService } = createRuntimeFixture(t);
  const drain = gate();
  const started = gate();
  const provider = await root.plugin(ProbeService);
  const consumer = await root.inject(['probe'], ctx => async () => {
    events.push('consumer:draining');
    started.resolve();
    await drain.promise;
    events.push(`consumer:read:${ctx.probe.read()}`);
    events.push('consumer:closed');
  });
  let completed = false;
  const stopping = provider.dispose().then(() => { completed = true; });
  await started.promise;
  assert.equal(completed, false);
  assert.equal(resources.size, 1);
  assert.equal(provider.ctx.probe.read(), 1);
  drain.resolve();
  await stopping;
  assert.deepEqual(events, [
    'provider:1:ready', 'consumer:draining', 'consumer:read:1',
    'consumer:closed', 'provider:1:closed',
  ]);
  assert.equal(consumer.state, state.pending);
  assert.equal(resources.size, 0);
});

test('重启提供者按依赖顺序清理后重新激活，不能复用已关闭服务', options, async t => {
  const { root, events, resources, ProbeService } = createRuntimeFixture(t);
  const provider = await root.plugin(ProbeService);
  const reads = [];
  const consumer = await root.inject(['probe'], ctx => {
    reads.push(ctx.probe.read());
    return () => events.push(`consumer:closed:${ctx.probe.read()}`);
  });
  const firstService = provider.ctx.probe;
  await provider.restart();
  await consumer.await();
  assert.deepEqual(reads, [1, 2]);
  assert.equal(firstService.open, false);
  assert.throws(() => firstService.read(), /已关闭/);
  assert.notEqual(provider.ctx.probe, firstService);
  assert.equal(resources.size, 1);
  assert.deepEqual(events.slice(0, 4), [
    'provider:1:ready', 'consumer:closed:1', 'provider:1:closed', 'provider:2:ready',
  ]);
});

test('重复装载与停用不累积服务资源，重复释放不重复执行', options, async t => {
  const { root, resources, events, ProbeService } = createRuntimeFixture(t);
  for (let round = 1; round <= 3; round++) {
    const provider = await root.plugin(ProbeService);
    assert.equal(provider.ctx.probe.read(), round);
    assert.equal(resources.size, 1);
    await provider.dispose();
    await provider.dispose();
    assert.equal(provider.state, state.disposed);
    assert.equal(resources.size, 0);
    assert.equal(root.get('probe'), undefined);
  }
  assert.equal(events.filter(event => event.endsWith(':closed')).length, 3);
});

test('两个运行时服务和清理互不干扰', options, async t => {
  const first = createRuntimeFixture(t);
  const second = createRuntimeFixture(t);
  await first.root.plugin(first.ProbeService);
  await second.root.plugin(second.ProbeService);
  await first.root.fiber.dispose();
  assert.equal(first.resources.size, 0);
  assert.equal(second.resources.size, 1);
  assert.equal(second.root.probe.read(), 1);
});

test('消费者清理抛错有日志，提供者仍能释放；销毁 Promise 不代表清理无错', options, async t => {
  const { root, resources, errors, ProbeService } = createRuntimeFixture(t, { expectedErrors: 1 });
  const expected = new Error('预期的清理失败');
  await root.plugin(ProbeService);
  await root.inject(['probe'], ctx => () => {
    assert.equal(ctx.probe.read(), 1);
    throw expected;
  });
  await root.fiber.dispose();
  assert.equal(resources.size, 0);
  assert.ok(errors.some(args => args.includes(expected)));
});

test('无结束信号的清理不会被运行时自动判为完成，解除门闩后才能收尾', options, async t => {
  const { root, gate, resources, ProbeService } = createRuntimeFixture(t);
  const release = gate();
  const started = gate();
  await root.plugin(ProbeService);
  await root.inject(['probe'], () => async () => {
    started.resolve();
    await release.promise;
  });
  let done = false;
  const disposal = root.fiber.dispose().then(() => { done = true; });
  await started.promise;
  await setImmediate();
  assert.equal(done, false);
  assert.equal(resources.size, 1);
  release.resolve();
  await disposal;
  assert.equal(done, true);
  assert.equal(resources.size, 0);
});

test('等待中的消费者停用后，即使服务后来出现也不得复活', options, async t => {
  const { root, ProbeService } = createRuntimeFixture(t);
  let activations = 0;
  const consumer = root.inject(['probe'], () => { activations++; });
  await consumer.await();
  assert.equal(consumer.state, state.pending);
  await consumer.dispose();
  await root.plugin(ProbeService);
  await setImmediate();
  assert.equal(activations, 0);
  assert.equal(consumer.uid, null, '运行身份已撤销，不能在依赖后来出现时重新激活');
});

test('已停用的等待实例应报告 DISPOSED（PR #133 回归）', options, async t => {
  const { root } = createRuntimeFixture(t);
  const consumer = root.inject(['missing'], () => {});
  await consumer.await();
  await consumer.dispose();
  assert.equal(consumer.uid, null);
  assert.equal(consumer.state, state.disposed);
});

for (const initial of ['pending', 'failed', 'active']) {
  test(`PR #133：${initial} 销毁后终态通知恰好一次，重复释放不重复通知`, options, async t => {
    const fixture = createRuntimeFixture(t, { expectedErrors: initial === 'failed' ? 1 : 0 });
    const { root } = fixture;
    let fiber;
    if (initial === 'pending') {
      fiber = root.inject(['missing'], () => {});
      await fiber.await();
    } else {
      fiber = root.plugin(() => {
        if (initial === 'failed') throw new Error('预期启动失败');
      });
      if (initial === 'failed') await assert.rejects(fiber.await(), /预期启动失败/);
      else await fiber.await();
    }
    // Cordis 返回的是公开包装对象，事件携带实际 Fiber，按稳定 uid 匹配。
    const id = fiber.uid;
    const transitions = [];
    const off = root.on('internal/status', (current, previous) => {
      if (current.uid === id || current === Object.getPrototypeOf(fiber)) {
        transitions.push([previous, current.state]);
      }
    });
    t.after(off);
    await fiber.dispose();
    assert.equal(fiber.uid, null);
    assert.equal(fiber.inertia, undefined);
    assert.equal(fiber.state, state.disposed);
    assert.equal(transitions.filter(([, next]) => next === state.disposed).length, 1);
    if (initial === 'active') assert.deepEqual(transitions, [[state.active, 5], [5, state.disposed]]);
    else assert.deepEqual(transitions, [[state[initial], state.disposed]]);
    await fiber.dispose();
    assert.equal(transitions.filter(([, next]) => next === state.disposed).length, 1);
  });
}

test('补丁守卫允许精确基线，拒绝浮动版本和其他安装版本', options, () => {
  assert.doesNotThrow(() => assertCordisPatchTarget('4.0.0-rc.11', '4.0.0-rc.11'));
  assert.throws(() => assertCordisPatchTarget('^4.0.0-rc.11', '4.0.0-rc.11'), /禁止误套/);
  assert.throws(() => assertCordisPatchTarget('4.0.0-rc.11', '4.0.0-rc.12'), /禁止误套/);
});

test('停用等待异步激活收尾并撤销中途资源，不留下半激活服务', options, async t => {
  const { root, resources, gate } = createRuntimeFixture(t);
  const setup = gate();
  const started = gate();
  const events = [];
  const provider = root.plugin(async function* (ctx) {
    resources.add('in-flight');
    yield () => {
      resources.delete('in-flight');
      events.push('rolled-back');
    };
    started.resolve();
    await setup.promise;
    events.push('setup-finished');
  });
  await started.promise;
  let stopped = false;
  const disposal = provider.dispose().then(() => { stopped = true; });
  await setImmediate();
  assert.equal(stopped, false);
  assert.notEqual(provider.state, state.disposed, '异步激活和回收尚未完成，不能提前报告销毁完成');
  assert.equal(resources.size, 1);
  setup.resolve();
  await disposal;
  assert.deepEqual(events, ['setup-finished', 'rolled-back']);
  assert.equal(resources.size, 0);
  assert.equal(provider.state, state.disposed);
});

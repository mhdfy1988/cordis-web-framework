import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogger } from 'cordis-web-framework/logging';
import type { LogEvent } from 'cordis-web-framework/logging';

test('日志：成熟适配执行级别过滤，上下文不可由单条字段冒充，兄弟日志器不串线', () => {
  const events: LogEvent[] = [];
  const logger = createLogger({ context: { instanceId: 'one' }, write: event => { events.push(event); } });
  const first = logger.child({ pluginId: 'first' });
  const second = logger.child({ pluginId: 'second' });
  first.log('debug', 'filtered');
  first.log('info', 'a', { instanceId: 'fake', pluginId: 'fake', value: 1 });
  second.log('error', 'b');
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(event => event.fields.pluginId), ['first', 'second']);
  assert.equal(events[0].fields.instanceId, 'one');
  assert.equal(Object.isFrozen(events[0].fields), true);
  assert.equal(createLogger({ level: 'silent', write() { assert.fail(); } }).log('error', 'ignored'), undefined);
});

test('日志：嵌套秘密脱敏、循环／错误／不可读字段可序列化，尺寸有界', () => {
  const events: LogEvent[] = [];
  const logger = createLogger({ write: event => { events.push(event); } });
  const cycle: Record<string, unknown> = { token: 'do-not-log', nested: { password: 'hidden', normal: 1 } };
  cycle.self = cycle;
  Object.defineProperty(cycle, 'getter', { enumerable: true, get() { throw new Error('bad getter'); } });
  logger.log('warn', 'x'.repeat(2000), { cycle, error: new Error('expected') });
  const output = JSON.stringify(events[0]);
  assert.equal(output.includes('do-not-log'), false);
  assert.equal(output.includes('hidden'), false);
  assert.ok(output.includes('[Circular]'));
  assert.ok(output.includes('[Unreadable]'));
  assert.equal(events[0].message.length, 1024);
  assert.ok(output.length < 10000);
});

test('日志：同步／异步输出失败通知且不破坏调用方，重复日志不被隐式合并', async () => {
  let errors = 0;
  for (const write of [() => { throw new Error('sync'); }, async () => { throw new Error('async'); }]) {
    const logger = createLogger({ write, onOutputError() { errors++; } });
    assert.doesNotThrow(() => logger.log('error', 'expected'));
  }
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(errors, 2);
  let count = 0;
  const logger = createLogger({ write() { count++; } });
  logger.log('info', 'same'); logger.log('info', 'same');
  assert.equal(count, 2);
});

test('日志：每次事件快照独立，超量字段不能挤掉关联身份', () => {
  const events: LogEvent[] = [];
  const logger = createLogger({ context: { pluginId: 'owned' }, write: event => { events.push(event); } });
  const fields = { nested: { value: 1 } };
  logger.log('info', 'snapshot', fields);
  fields.nested.value = 2;
  logger.log('info', 'bounded', Object.fromEntries(Array.from({ length: 1000 }, (_, i) => ['field' + i, 'x'.repeat(10000)])));
  assert.equal((events[0].fields.nested as { value: number }).value, 1);
  assert.equal(events[1].fields.pluginId, 'owned');
  assert.ok(JSON.stringify(events[1]).length < 20000);
});

test('日志：异步输出在途有界，超量显式通知而不无限排队，恢复后可继续写', async () => {
  const gate = Promise.withResolvers<void>();
  let writes = 0;
  const errors: unknown[] = [];
  const logger = createLogger({ maxPendingWrites: 1, write() { writes++; return gate.promise; }, onOutputError(error) { errors.push(error); } });
  for (let i = 0; i < 100; i++) logger.log('info', 'bounded');
  assert.equal(writes, 1);
  assert.equal(errors.length, 1);
  assert.match(String(errors[0]), /拥塞/);
  gate.resolve();
  await new Promise<void>(resolve => setImmediate(resolve));
  logger.log('info', 'recovered');
  assert.equal(writes, 2);
  for (const maxPendingWrites of [0, -1, NaN, Infinity, 1.5, 1025]) {
    assert.throws(() => createLogger({ maxPendingWrites }), TypeError);
  }
});

test('日志：顶层不可读字段和子上下文不通过对象展开触发异常', () => {
  const events: LogEvent[] = [];
  const input = Object.defineProperty({}, 'bad', { enumerable: true, get() { throw new Error('unreadable'); } });
  const logger = createLogger({ write: event => { events.push(event); } });
  assert.doesNotThrow(() => logger.child(input).log('info', 'safe', input));
  assert.equal(events[0].fields.bad, '[Unreadable]');
});

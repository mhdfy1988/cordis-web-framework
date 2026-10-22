import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { startRecordsApplication } from '../examples/records/server/application.ts';
import { openRecordRepository } from '../examples/records/server/sqlite-repository.ts';
import { createJsonClient, ApiClientError } from 'cordis-web-framework/http-json';
import { createLogger, type LogEvent } from 'cordis-web-framework/logging';
import { sessionOperation, listOperation, saveOperation } from '../examples/records/shared/protocol.ts';
import type { RecordHooks } from '../examples/records/server/record-service.ts';

function location() { return resolve(mkdtempSync(resolve(tmpdir(), 'cordis-w3-')), 'records.sqlite'); }
async function authenticated(address: string, mode: 'editor' | 'viewer' = 'editor') {
  let token: string | undefined;
  const client = createJsonClient({ baseUrl: address, credential: () => token });
  token = (await client.request(sessionOperation, { mode })).data.token;
  return { client, token };
}
test('记录插件真实保存、SQLite 回读、重启后仍存在且修订递增，日志可关联', async () => {
  const databaseFile = location(); const events: LogEvent[] = [];
  let host = await startRecordsApplication({ databaseFile, localDemo: true, logger: createLogger({ write: event => { events.push(event); } }) });
  let requestId = '';
  try {
    const { client, token } = await authenticated(host.address);
    const first = (await client.request(listOperation, {})).data.records[0];
    const result = await client.request(saveOperation, { id: first.id, revision: first.revision, title: '持久保存测试', body: '中文正文和 " 引号' });
    requestId = result.requestId;
    assert.equal(result.data.revision, first.revision + 1);
    const readback = new DatabaseSync(databaseFile, { readOnly: true });
    try { assert.equal(readback.prepare('SELECT title FROM records WHERE id = ?').get(first.id)!.title, '持久保存测试'); }
    finally { readback.close(); }
    assert.ok(events.some(event => event.message === 'records.committed' && event.fields.requestId === requestId));
    assert.ok(!JSON.stringify(events).includes(token));
    await assert.rejects(client.request(saveOperation, { id: first.id, revision: first.revision, title: '旧修订', body: '' }),
      (error: unknown) => error instanceof ApiClientError && error.code === 'conflict');
    await host.stop();
    host = await startRecordsApplication({ databaseFile, localDemo: true });
    const afterRestart = await authenticated(host.address);
    assert.equal((await afterRestart.client.request(listOperation, {})).data.records.find(record => record.id === first.id)!.title, '持久保存测试');
  } finally { await host.stop(); }
});

test('未认证、无效凭据、只读写入、他人记录和伪造身份均拒绝且不改数据', async () => {
  const databaseFile = location();
  const host = await startRecordsApplication({ databaseFile, localDemo: true });
  try {
    const viewer = await authenticated(host.address, 'viewer');
    const editor = await authenticated(host.address);
    const first = (await viewer.client.request(listOperation, {})).data.records[0];
    assert.equal(first.canEdit, false);
    for (const [client, input, expected] of [
      [createJsonClient({ baseUrl: host.address }), { id: first.id, revision: 1, title: '拒绝', body: '' }, 'unauthenticated'],
      [createJsonClient({ baseUrl: host.address, credential: () => 'forged-token' }), { id: first.id, revision: 1, title: '拒绝', body: '' }, 'unauthenticated'],
      [viewer.client, { id: first.id, revision: 1, title: '拒绝', body: '' }, 'forbidden'],
      [editor.client, { id: 'private', revision: 1, title: '拒绝', body: '' }, 'forbidden'],
    ] as const) await assert.rejects(client.request(saveOperation, input), (error: unknown) => error instanceof ApiClientError && error.code === expected);
    const forged = await fetch(`${host.address}/api/record`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-framework-api': '1',
      authorization: `Bearer ${viewer.token}`, 'x-user-id': 'demo-user', 'x-user-role': 'admin' },
      body: JSON.stringify({ id: first.id, revision: 1, title: '非法写入', body: '' }) });
    assert.equal(forged.status, 403); await forged.text();
    assert.notEqual((await editor.client.request(listOperation, {})).data.records[0].title, '非法写入');
  } finally { await host.stop(); }
});

test('存储故障显式报错，不回退内存或伪报保存', async () => {
  const databaseFile = location();
  const host = await startRecordsApplication({ databaseFile, localDemo: true });
  const lock = new DatabaseSync(databaseFile);
  try {
    const { client } = await authenticated(host.address);
    const record = (await client.request(listOperation, {})).data.records[0];
    lock.exec('BEGIN IMMEDIATE');
    await assert.rejects(client.request(saveOperation, { ...record, canEdit: undefined } as never));
    await assert.rejects(client.request(saveOperation, { id: record.id, revision: record.revision, title: '不可写', body: '' }),
      (error: unknown) => error instanceof ApiClientError && error.code === 'internal-error');
    lock.exec('ROLLBACK');
    assert.equal((await client.request(listOperation, {})).data.records[0].revision, record.revision);
  } finally { if (lock.isTransaction) lock.exec('ROLLBACK'); lock.close(); await host.stop(); }
});

test('未知数据库版本失败，不删文件、不回退内存', () => {
  const databaseFile = location();
  const database = new DatabaseSync(databaseFile); database.exec('PRAGMA user_version = 99'); database.close();
  assert.throws(() => openRecordRepository(databaseFile), /不支持/);
  const readback = new DatabaseSync(databaseFile); assert.equal(readback.prepare('PRAGMA user_version').get()!.user_version, 99); readback.close();
});

for (const committed of [false, true]) test(`真实 HTTP 取消：${committed ? '提交后不回滚' : '提交前不写入'}，断开后仍排空处理器`, async () => {
  const entered = Promise.withResolvers<void>(); const released = Promise.withResolvers<void>(); const cancelled = Promise.withResolvers<void>();
  const hook: NonNullable<RecordHooks['beforeSave']> = async context => {
    context.signal.addEventListener('abort', () => cancelled.resolve(), { once: true }); entered.resolve(); await released.promise;
  };
  const databaseFile = location();
  const host = await startRecordsApplication({ databaseFile, localDemo: true, hooks: committed ? { afterCommit: hook } : { beforeSave: hook } });
  try {
    const { client } = await authenticated(host.address);
    const record = (await client.request(listOperation, {})).data.records[0];
    const abort = new AbortController();
    const pending = client.request(saveOperation, { id: record.id, revision: record.revision, title: '取消中的保存', body: '' }, abort.signal);
    const rejection = assert.rejects(pending, (error: unknown) => error instanceof ApiClientError && error.code === 'cancelled');
    await entered.promise; abort.abort(); await rejection; await cancelled.promise;
    const stopping = host.stop(); assert.equal(host.inspect().state, 'stopping');
    released.resolve(); assert.equal((await stopping).state, 'stopped');
    const readback = openRecordRepository(databaseFile);
    try { assert.equal(readback.read(record.id).title === '取消中的保存', committed); }
    finally { readback.close(); }
  } finally { released.resolve(); await host.stop(); }
});

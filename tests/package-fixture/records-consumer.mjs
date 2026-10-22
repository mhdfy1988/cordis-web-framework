import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startRecordsApplication } from './records/server/application.ts';
import { createJsonClient } from 'cordis-web-framework/http-json';
import { listOperation, saveOperation, sessionOperation } from './records/shared/protocol.ts';

const databaseFile = resolve('records-consumer.sqlite');
let host = await startRecordsApplication({ localDemo: true, databaseFile });
try {
  let token;
  const client = createJsonClient({ baseUrl: host.address, credential: () => token });
  token = (await client.request(sessionOperation, { mode: 'editor' })).data.token;
  const record = (await client.request(listOperation, {})).data.records[0];
  await client.request(saveOperation, { id: record.id, revision: record.revision, title: '隔离包消费保存', body: '真实 SQLite' });
  await host.stop();
  host = await startRecordsApplication({ localDemo: true, databaseFile });
  let newToken;
  const reopened = createJsonClient({ baseUrl: host.address, credential: () => newToken });
  newToken = (await reopened.request(sessionOperation, { mode: 'editor' })).data.token;
  assert.equal((await reopened.request(listOperation, {})).data.records[0].title, '隔离包消费保存');
  const database = new DatabaseSync(databaseFile, { readOnly: true });
  assert.equal(database.prepare('SELECT title FROM records WHERE id = ?').get(record.id).title, '隔离包消费保存'); database.close();
} finally { await host.stop(); }
console.log('W3 独立包全栈保存与重启回读通过');

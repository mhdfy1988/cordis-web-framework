import assert from 'node:assert/strict';
import test from 'node:test';
import { createEditorSession } from '../examples/records/browser/editor-session.ts';
import { createJsonClient } from 'cordis-web-framework/http-json';

const record = { id: 'first', title: '原始标题', body: '', revision: 1, canEdit: true };
function response(data: unknown) { const requestId = crypto.randomUUID(); return new Response(JSON.stringify({ protocol: '1', requestId, ok: true, data }),
  { headers: { 'content-type': 'application/json', 'x-request-id': requestId } }); }

test('身份切换时旧请求迟到，不能覆写新凭据和当前只读状态', async () => {
  const first = Promise.withResolvers<Response>(); let count = 0; let token: string | undefined;
  const client = createJsonClient({ baseUrl: 'http://sample.test', fetch: async url => {
    if (new URL(String(url)).pathname === '/demo/session') {
      count++; return count === 1 ? first.promise : response({ token: 'viewer-credential-1234567890', mode: 'viewer' });
    }
    return response({ records: [{ ...record, canEdit: false }] });
  } });
  const session = createEditorSession(client, value => { token = value; });
  const previous = session.identify('editor');
  await session.identify('viewer');
  first.resolve(response({ token: 'stale-credential-1234567890', mode: 'editor' }));
  await previous;
  assert.equal(token, 'viewer-credential-1234567890');
  assert.equal(session.inspect().mode, 'viewer');
  assert.equal(session.inspect().records[0].canEdit, false);
  session.dispose(); assert.equal(token, undefined);
});

test('取消保存保留草稿，忽略迟到成功；核对后才解除结果未确认状态', async () => {
  const saving = Promise.withResolvers<Response>(); let committed = false;
  const client = createJsonClient({ baseUrl: 'http://sample.test', fetch: async url => {
    const path = new URL(String(url)).pathname;
    if (path === '/demo/session') return response({ token: 'credential-123456789012345', mode: 'editor' });
    if (path === '/api/record') return saving.promise;
    return response({ records: [committed ? { ...record, title: '草稿', revision: 2 } : record] });
  } });
  const session = createEditorSession(client, () => {});
  await session.identify('editor'); session.edit('title', '草稿');
  const pending = session.save(); session.cancel();
  committed = true; saving.resolve(response({ ...record, title: '草稿', revision: 2 })); await pending;
  assert.equal(session.inspect().uncertain, true);
  assert.equal(session.inspect().draft.title, '草稿');
  assert.match(session.inspect().status, /结果未确认/);
  await session.checkServer();
  assert.equal(session.inspect().uncertain, false);
  assert.match(session.inspect().status, /服务器已保存/);
  session.dispose();
});

test('关闭编辑会话后迟到读取不通知视图、不写入凭据、不改变状态', async () => {
  const delayed = Promise.withResolvers<Response>(); let notified = 0; let token: string | undefined;
  const client = createJsonClient({ baseUrl: 'http://sample.test', fetch: () => delayed.promise });
  const session = createEditorSession(client, value => { token = value; });
  session.subscribe(() => { notified++; });
  const pending = session.identify('editor'); session.dispose(); const snapshot = session.inspect(); const prior = notified;
  delayed.resolve(response({ token: 'credential-123456789012345', mode: 'editor' })); await pending;
  assert.equal(session.inspect(), snapshot); assert.equal(notified, prior); assert.equal(token, undefined);
});

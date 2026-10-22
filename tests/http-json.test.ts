import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { startNodeHost } from 'cordis-web-framework/hosts/node';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { createJsonClient, defineJsonEndpoint, ApiError, ApiClientError, JSON_BYTE_LIMIT } from 'cordis-web-framework/http-json';
import { createLogger } from 'cordis-web-framework/logging';
import type { LogEvent } from 'cordis-web-framework/logging';
import type { JsonOperation } from 'cordis-web-framework/contracts/http';

const operation: JsonOperation<{ value: number }, { value: number }> = { path: '/api/value', method: 'PUT',
  input: zodConfig(z.strictObject({ value: z.number().int().min(0) })), output: zodConfig(z.strictObject({ value: z.number().int() })) };
const base = { document: { formatVersion: 1, plugins: [], bindings: {} }, catalog: new Map(), createRuntime: createCordisRuntime };

test('JSON 协议真实往返、服务端生成请求标识，日志不含凭据或原始正文', async () => {
  const events: LogEvent[] = [];
  const host = await startNodeHost({ ...base, logger: createLogger({ write: event => { events.push(event); } }),
    api: [defineJsonEndpoint(operation, (context, input) => {
      assert.equal(context.credential, 'test-private-token');
      context.logger.log('info', 'business.confirmed'); return { value: input.value + 1 };
    })] });
  try {
    const result = await createJsonClient({ baseUrl: host.address, credential: () => 'test-private-token' }).request(operation, { value: 3 });
    assert.deepEqual(result.data, { value: 4 });
    assert.match(result.requestId, /^[0-9a-f-]{36}$/);
    assert.ok(events.filter(event => ['http.started', 'business.confirmed', 'http.succeeded'].includes(event.message))
      .every(event => event.fields.requestId === result.requestId));
    assert.ok(!JSON.stringify(events).includes('test-private-token'));
    const raw = await fetch(`${host.address}/api/value`, { method: 'PUT', headers: { 'content-type': 'application/json',
      'x-framework-api': '1', authorization: 'Bearer test-private-token', 'x-request-id': 'forged-id' }, body: '{"value":2}' });
    assert.notEqual(raw.headers.get('x-request-id'), 'forged-id'); await raw.text();
  } finally { await host.stop(); }
});

test('协议版本、非法 JSON、未知字段、超量请求均明确拒绝且不执行处理器', async () => {
  let called = 0;
  const host = await startNodeHost({ ...base, api: [defineJsonEndpoint(operation, (_context, input) => { called++; return input; })] });
  try {
    for (const [version, body, expected] of [['2', '{"value":1}', 426], ['1', '{', 422],
      ['1', '{"value":1,"role":"admin"}', 422], ['1', JSON.stringify({ value: 'x'.repeat(JSON_BYTE_LIMIT) }), 413]] as const) {
      const response = await fetch(`${host.address}/api/value`, { method: 'PUT', headers: { 'x-framework-api': version, 'content-type': 'application/json' }, body });
      assert.equal(response.status, expected); assert.equal((await response.json()).ok, false);
    }
    assert.equal(called, 0);
  } finally { await host.stop(); }
});

test('业务拒绝与内部异常有固定错误契约，不泄漏异常消息；无效输出不能伪报成功', async () => {
  for (const handler of [() => { throw new ApiError('forbidden'); }, () => { throw new Error('database-secret-path'); },
    () => ({ value: 'invalid' } as unknown as { value: number })]) {
    const host = await startNodeHost({ ...base, api: [defineJsonEndpoint(operation, handler)] });
    try {
      await assert.rejects(createJsonClient({ baseUrl: host.address }).request(operation, { value: 1 }),
        (error: unknown) => error instanceof ApiClientError && ['forbidden', 'internal-error'].includes(error.code) && !error.message.includes('database-secret-path'));
    } finally { await host.stop(); }
  }
});

test('客户端不重试写入，校验响应版本、关联标识、状态、数据和字节预算', async () => {
  const id = crypto.randomUUID(); let calls = 0;
  for (const [body, status, headerId] of [
    [{ protocol: '2', requestId: id, ok: true, data: { value: 1 } }, 200, id],
    [{ protocol: '1', requestId: id, ok: true, data: { value: 'bad' } }, 200, id],
    [{ protocol: '1', requestId: id, ok: true, data: { value: 1 } }, 200, crypto.randomUUID()],
    [{ protocol: '1', requestId: id, ok: false, error: { code: 'forbidden' } }, 200, id],
    ['x'.repeat(JSON_BYTE_LIMIT + 1), 200, id],
  ] as const) {
    const client = createJsonClient({ baseUrl: 'http://example.test', fetch: async () => {
      calls++; return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-request-id': headerId } });
    } });
    await assert.rejects(client.request(operation, { value: 1 }), ApiClientError);
  }
  assert.equal(calls, 5);
  const client = createJsonClient({ baseUrl: 'http://example.test', fetch: async () => { calls++; throw new Error('offline'); } });
  await assert.rejects(client.request(operation, { value: 1 }), (error: unknown) => error instanceof ApiClientError && error.code === 'network-error');
  assert.equal(calls, 6);
  await assert.rejects(client.request({ ...operation, path: '//other.test/path' }, { value: 1 }));
  assert.equal(calls, 6);
});

test('JSON 路由与静态资源冲突在激活之前失败', async () => {
  let factories = 0;
  await assert.rejects(startNodeHost({ ...base, createRuntime() { factories++; return createCordisRuntime(); },
    api: [defineJsonEndpoint(operation, (_context, input) => input), defineJsonEndpoint(operation, (_context, input) => input)] }));
  assert.equal(factories, 0);
});

test('响应预算包含 UTF-8 字节与完整协议包装，GET 不静默丢弃参数', async () => {
  const operation: JsonOperation<Record<string, never>, string> = { method: 'GET', path: '/api/large',
    input: zodConfig(z.strictObject({})), output: zodConfig(z.string()) };
  const host = await startNodeHost({ ...base, api: [defineJsonEndpoint(operation, () => '中'.repeat(22_000))] });
  try {
    await assert.rejects(createJsonClient({ baseUrl: host.address }).request(operation, {}),
      (error: unknown) => error instanceof ApiClientError && error.code === 'payload-too-large');
    const query = await fetch(`${host.address}/api/large?userId=admin`, { headers: { 'x-framework-api': '1' } });
    assert.equal(query.status, 422); await query.text();
  } finally { await host.stop(); }
});

test('在途 JSON 处理器有明确上限，超量拒绝而非无限排队', async () => {
  const entered = Promise.withResolvers<void>(); const released = Promise.withResolvers<void>(); let calls = 0;
  const host = await startNodeHost({ ...base, maxActiveApiRequests: 1, api: [defineJsonEndpoint(operation, async (_context, input) => {
    calls++; entered.resolve(); await released.promise; return input;
  })] });
  const client = createJsonClient({ baseUrl: host.address });
  const first = client.request(operation, { value: 1 });
  try {
    await entered.promise;
    await assert.rejects(client.request(operation, { value: 2 }), (error: unknown) => error instanceof ApiClientError && error.code === 'unavailable');
    assert.equal(calls, 1);
    released.resolve(); await first;
  } finally { released.resolve(); await first; await host.stop(); }
});

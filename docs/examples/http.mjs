import assert from 'node:assert/strict';
import { z } from 'zod';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { createJsonClient, defineJsonEndpoint } from 'cordis-web-framework/http-json';
import { startNodeHost } from 'cordis-web-framework/hosts/node';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';

const shape = zodConfig(z.strictObject({ text: z.string().min(1).max(100) }));
const operation = { method: 'POST', path: '/api/echo', input: shape, output: shape };
const host = await startNodeHost({ document: { formatVersion: 1, plugins: [], bindings: {} }, catalog: new Map(),
  createRuntime: createCordisRuntime, api: [defineJsonEndpoint(operation, (context, input) => {
    context.signal.throwIfAborted(); return { text: input.text };
  })] });
try {
  const client = createJsonClient({ baseUrl: host.address });
  const result = await client.request(operation, { text: '来自浏览器的意图' });
  assert.equal(result.data.text, '来自浏览器的意图'); assert.match(result.requestId, /^[0-9a-f-]{36}$/);
  console.log(result.data, result.requestId);
} finally { assert.equal((await host.stop()).state, 'stopped'); }

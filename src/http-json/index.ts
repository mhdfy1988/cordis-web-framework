import type { ApiEnvelope, ApiErrorCode, ApiRequestContext, JsonEndpoint, JsonOperation } from '../contracts/http.ts';
import { JSON_BYTE_LIMIT, JSON_PROTOCOL_VERSION } from '../contracts/http.ts';
import { apiEnvelopeValidator } from '../validation-zod/index.ts';
export type { ApiRequestContext, JsonEndpoint, JsonOperation, ApiErrorCode } from '../contracts/http.ts';
export { JSON_BYTE_LIMIT, JSON_PROTOCOL_VERSION } from '../contracts/http.ts';

export const API_STATUS: Readonly<Record<ApiErrorCode, number>> = Object.freeze({
  'invalid-input': 422, unauthenticated: 401, forbidden: 403, 'not-found': 404, conflict: 409,
  'protocol-incompatible': 426, 'payload-too-large': 413, 'unsupported-media': 415, cancelled: 499,
  unavailable: 503, 'internal-error': 500,
});
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  constructor(code: ApiErrorCode) { super(code); this.name = 'ApiError'; this.code = code; }
}
export function errorEnvelope(requestId: string, code: ApiErrorCode): ApiEnvelope {
  return { protocol: JSON_PROTOCOL_VERSION, requestId, ok: false, error: { code } };
}
export function defineJsonEndpoint<I, O>(operation: JsonOperation<I, O>,
  handle: (context: ApiRequestContext, input: Readonly<I>) => O | Promise<O>): JsonEndpoint {
  return Object.freeze({ path: operation.path, method: operation.method, async execute(context: ApiRequestContext, body: unknown) {
    context.signal.throwIfAborted();
    const input = operation.input.validate(body);
    if (!input.ok) throw new ApiError('invalid-input');
    const result = await handle(context, input.value);
    const output = operation.output.validate(result);
    if (!output.ok) throw new ApiError('internal-error');
    return output.value;
  } });
}

export class ApiClientError extends Error {
  readonly code: ApiErrorCode | 'network-error' | 'invalid-response';
  readonly requestId?: string;
  constructor(code: ApiClientError['code'], requestId?: string) {
    super(code); this.name = 'ApiClientError'; this.code = code; this.requestId = requestId;
  }
}
async function readBoundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new ApiClientError('invalid-response');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0; let text = '';
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > JSON_BYTE_LIMIT) { void reader.cancel().catch(() => {}); throw new ApiClientError('payload-too-large'); }
      text += decoder.decode(item.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('invalid-response');
  } finally { reader.releaseLock(); }
}
export function createJsonClient(options: {
  readonly baseUrl: string;
  readonly credential?: () => string | undefined;
  readonly fetch?: typeof globalThis.fetch;
}) {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const base = new URL(options.baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new TypeError('JSON 客户端地址必须是 HTTP 源地址');
  return Object.freeze({ async request<I, O>(operation: JsonOperation<I, O>, input: I, signal?: AbortSignal): Promise<{ data: O; requestId: string }> {
    const parsed = operation.input.validate(input);
    if (!parsed.ok) throw new ApiClientError('invalid-input');
    if (!['GET', 'POST', 'PUT'].includes(operation.method)) throw new TypeError('JSON 请求方法无效');
    if (operation.method === 'GET' && (parsed.value === null || typeof parsed.value !== 'object'
      || Array.isArray(parsed.value) || Object.keys(parsed.value).length)) throw new ApiClientError('invalid-input');
    if (!/^\/[a-zA-Z0-9/_-]*$/.test(operation.path) || operation.path.startsWith('//')) throw new TypeError('JSON 请求路径无效');
    const headers: Record<string, string> = { 'x-framework-api': JSON_PROTOCOL_VERSION, accept: 'application/json' };
    const credential = options.credential?.();
    if (credential) headers.authorization = `Bearer ${credential}`;
    let body: string | undefined;
    if (operation.method !== 'GET') {
      body = JSON.stringify(parsed.value);
      if (new TextEncoder().encode(body).byteLength > JSON_BYTE_LIMIT) throw new ApiClientError('payload-too-large');
      headers['content-type'] = 'application/json';
    }
    try {
      const response = await fetcher(new URL(operation.path, base), { method: operation.method, headers, body, signal, credentials: 'omit', redirect: 'error' });
      if (!response.headers.get('content-type')?.startsWith('application/json')) throw new ApiClientError('invalid-response');
      const envelope = apiEnvelopeValidator.validate(await readBoundedJson(response));
      if (!envelope.ok || envelope.value.requestId !== response.headers.get('x-request-id')) throw new ApiClientError('invalid-response');
      const value = envelope.value;
      if (!value.ok) {
        if (response.status !== API_STATUS[value.error.code]) throw new ApiClientError('invalid-response');
        throw new ApiClientError(value.error.code, value.requestId);
      }
      if (!response.ok) throw new ApiClientError('invalid-response');
      const output = operation.output.validate(value.data);
      if (!output.ok) throw new ApiClientError('invalid-response', value.requestId);
      signal?.throwIfAborted();
      return { data: output.value, requestId: value.requestId };
    } catch (error) {
      if (signal?.aborted) throw new ApiClientError('cancelled');
      if (error instanceof ApiClientError) throw error;
      throw new ApiClientError('network-error');
    }
  } });
}

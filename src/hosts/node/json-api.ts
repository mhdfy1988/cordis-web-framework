import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ApiRequestContext, JsonEndpoint } from '../../contracts/http.ts';
import type { Logger } from '../../contracts/logging.ts';
import { ApiError, API_STATUS, errorEnvelope, JSON_BYTE_LIMIT, JSON_PROTOCOL_VERSION } from '../../http-json/index.ts';
import type { createJsonEndpointRegistry } from '../../http-json/registry.ts';

/** 请求对象只在此适配内存活，不进入插件上下文或应用全局状态。 */
export function installJsonApi(server: FastifyInstance, endpoints: readonly JsonEndpoint[], logger: Logger, maxActive: number,
  dynamic?: ReturnType<typeof createJsonEndpointRegistry>) {
  const requests = new WeakMap<FastifyRequest, ApiRequestContext>();
  const active = new Set<Promise<void>>();
  server.setErrorHandler((error, request, reply) => {
    const context = requests.get(request);
    if (!context) { void reply.code(500).send({ error: 'internal-error' }); return; }
    const status = (error as { statusCode?: number }).statusCode;
    const code = error instanceof ApiError ? error.code : status === 413 ? 'payload-too-large'
      : status === 415 ? 'unsupported-media' : status === 400 ? 'invalid-input' : 'internal-error';
    context.logger.log(code === 'internal-error' ? 'error' : 'warn', 'http.rejected', { code });
    void reply.code(API_STATUS[code]).send(errorEnvelope(context.requestId, code));
  });
  const wildcard = dynamic ? ['GET', 'POST', 'PUT'].map(method => ({ method: method as JsonEndpoint['method'], path: '/extensions/*',
    execute: async () => undefined })) : [];
  for (const endpoint of [...endpoints, ...wildcard]) server.route({ method: endpoint.method, url: endpoint.path,
    async onRequest(request, reply) {
      const requestId = randomUUID();
      const controller = new AbortController();
      const credential = /^Bearer ([^\s]{1,1024})$/.exec(request.headers.authorization ?? '')?.[1];
      const log = logger.child({ requestId, path: endpoint.path, method: endpoint.method });
      const context = Object.freeze({ requestId, signal: controller.signal, credential, logger: log });
      requests.set(request, context);
      reply.header('x-request-id', requestId).header('cache-control', 'no-store');
      const abort = () => {
        if (!reply.raw.writableFinished && !controller.signal.aborted) {
          controller.abort(); log.log('info', 'http.cancelled');
        }
      };
      const rawClosed = () => { if (request.raw.aborted) abort(); };
      const remove = () => { request.raw.off('close', rawClosed); reply.raw.off('close', abort); };
      request.raw.on('close', rawClosed); reply.raw.once('close', abort); reply.raw.once('finish', remove);
      reply.raw.once('close', remove);
      log.log('info', 'http.started');
      if (request.headers['x-framework-api'] !== JSON_PROTOCOL_VERSION) throw new ApiError('protocol-incompatible');
    },
    async handler(request, reply) {
      const context = requests.get(request)!;
      if (active.size >= maxActive) throw new ApiError('unavailable');
      const finished = Promise.withResolvers<void>();
      active.add(finished.promise);
      try {
        if (endpoint.method === 'GET' && request.query && Object.keys(request.query).length) throw new ApiError('invalid-input');
        const body = endpoint.method === 'GET' ? {} : request.body;
        const data = endpoint.path === '/extensions/*'
          ? await dynamic!.execute(endpoint.method, request.url.split('?')[0], context, body) : await endpoint.execute(context, body);
        const encoded = JSON.stringify({ protocol: JSON_PROTOCOL_VERSION, requestId: context.requestId, ok: true, data });
        if (new TextEncoder().encode(encoded).byteLength > JSON_BYTE_LIMIT) throw new ApiError('payload-too-large');
        context.logger.log('info', 'http.succeeded');
        return reply.type('application/json; charset=utf-8').send(encoded);
      } catch (error) {
        if (context.signal.aborted) throw new ApiError('cancelled');
        throw error;
      } finally { active.delete(finished.promise); finished.resolve(); }
    },
  });
  return { async drain() { await Promise.all([...active]); } };
}

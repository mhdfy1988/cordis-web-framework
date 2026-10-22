import Fastify from 'fastify';
import type { HostHandle, HostOptions, HostRuntimeView } from '../../contracts/host.ts';
import { nodeListenerValidator } from '../../validation-zod/index.ts';
import { openHost } from '../shared/lifecycle.ts';
import { installJsonApi } from './json-api.ts';
import type { JsonEndpoint, StaticAsset } from '../../contracts/http.ts';
import type { Logger } from '../../contracts/logging.ts';
import { createLogger } from '../../logging-consola/index.ts';
import type { createJsonEndpointRegistry } from '../../http-json/registry.ts';
import type { createStaticAssetRegistry } from '../../http-json/assets.ts';
export { HostStartError } from '../shared/lifecycle.ts';
export { bindProcessSignals } from './signals.ts';
export type { HostHandle, HostOptions, HostSnapshot } from '../../contracts/host.ts';

export interface NodeHostOptions extends HostOptions {
  readonly dynamicApi?: ReturnType<typeof createJsonEndpointRegistry>;
  readonly dynamicAssets?: ReturnType<typeof createStaticAssetRegistry>;
  readonly hostname?: string;
  readonly port?: number;
  readonly routes?: readonly { readonly path: string; readonly handle: (runtime: HostRuntimeView) => unknown | Promise<unknown> }[];
  readonly api?: readonly JsonEndpoint[];
  readonly assets?: readonly StaticAsset[];
  readonly logger?: Logger;
  readonly maxActiveApiRequests?: number;
}
export interface NodeHost extends HostHandle { readonly address: string }

export async function startNodeHost(options: NodeHostOptions): Promise<NodeHost> {
  const parsed = nodeListenerValidator.validate({ hostname: options.hostname, port: options.port });
  if (!parsed.ok) throw new TypeError('HTTP 监听配置无效');
  const maxActive = options.maxActiveApiRequests ?? 64;
  if (!Number.isInteger(maxActive) || maxActive < 1 || maxActive > 1024) throw new TypeError('JSON 在途请求上限无效');
  const paths = new Set(['/health/ready']);
  const routes = (options.routes ?? []).map(route => Object.freeze({ path: route.path, handle: route.handle }));
  if (routes.length > 128) throw new TypeError('HTTP 路由数量超过首版上限');
  for (const route of routes) {
    if (!/^\/[a-zA-Z0-9/_-]*$/.test(route.path) || paths.has(route.path) || typeof route.handle !== 'function') {
      throw new TypeError('HTTP 路径无效、冲突或缺少处理器');
    }
    paths.add(route.path);
  }
  const api = (options.api ?? []).map(endpoint => Object.freeze({ method: endpoint.method, path: endpoint.path, execute: endpoint.execute.bind(endpoint) }));
  if (options.dynamicApi && [...api, ...routes].some(item => item.path.startsWith('/extensions/'))) throw new Error('静态端点占用动态命名空间');
  const assets = (options.assets ?? []).map(asset => Object.freeze({ ...asset }));
  if ([...api, ...routes, ...assets].some(item => (options.dynamicApi && item.path.startsWith('/extensions/'))
    || (options.dynamicAssets && item.path.startsWith('/plugin-assets/')))) throw new Error('静态路由占用动态命名空间');
  if (api.length + routes.length + assets.length > 128) throw new TypeError('HTTP 路由数量超过首版上限');
  const methods = new Set(routes.map(route => `GET:${route.path}`));
  for (const endpoint of api) {
    if (!['GET', 'POST', 'PUT'].includes(endpoint.method) || !/^\/[a-zA-Z0-9/_-]*$/.test(endpoint.path)
      || endpoint.path.startsWith('//') || endpoint.path === '/health/ready' || methods.has(`${endpoint.method}:${endpoint.path}`)) throw new TypeError('JSON 端点冲突或无效');
    methods.add(`${endpoint.method}:${endpoint.path}`);
  }
  for (const asset of assets) {
    if (!/^\/[a-zA-Z0-9/_.-]*$/.test(asset.path) || asset.path.startsWith('//') || asset.path.includes('..')
      || paths.has(asset.path) || methods.has(`GET:${asset.path}`)
      || !['text/html; charset=utf-8', 'text/javascript; charset=utf-8', 'text/css; charset=utf-8'].includes(asset.contentType)
      || typeof asset.content !== 'string' || new TextEncoder().encode(asset.content).byteLength > 4_194_304) throw new TypeError('静态资源无效或冲突');
    paths.add(asset.path);
  }
  let address = '';
  const host = await openHost(options, { platform: 'node', capabilities: ['http', 'crypto'] }, async context => {
    // 不启用 Fastify 自带请求日志，避免另起日志系统或输出认证头。
    const server = Fastify({ logger: false, bodyLimit: 65_536, requestTimeout: 30_000,
      connectionTimeout: 10_000, forceCloseConnections: 'idle', return503OnClosing: true });
    let draining = false;
    let drainApi: () => Promise<void> = async () => {};
    context.onRelease(async () => { draining = true; await server.close(); await drainApi(); });
    server.addHook('onRequest', async (_request, reply) => {
      if (draining) return reply.code(503).send({ error: 'host-stopping' });
    });
    // 已进入处理器的请求在关闭后才响应，也必须结束保活，不能留下新空闲连接。
    server.addHook('onSend', async (_request, reply, payload) => {
      if (draining) reply.header('connection', 'close');
      return payload;
    });
    drainApi = installJsonApi(server, api, options.logger ?? createLogger({ level: 'silent' }), maxActive, options.dynamicApi).drain;
    server.get('/health/ready', async (_request, reply) => {
      const ready = context.runtime.audit().ready;
      return reply.code(ready ? 200 : 503).send({ ready });
    });
    for (const route of routes) server.get(route.path, () => route.handle(context.runtime));
    for (const asset of assets) server.get(asset.path, (_request, reply) => reply.type(asset.contentType)
      .header('x-content-type-options', 'nosniff').header('cache-control', 'no-store').send(asset.content));
    if (options.dynamicAssets) server.get('/plugin-assets/*', (request, reply) => {
      const asset = options.dynamicAssets!.get(request.url.split('?')[0]);
      if (!asset) return reply.code(404).send({ error: 'not-found' });
      return reply.type(asset.contentType).header('x-content-type-options', 'nosniff').header('cache-control', 'no-store').send(asset.content);
    });
    address = await server.listen({ port: parsed.value.port, host: parsed.value.hostname });
  });
  return Object.freeze({ ...host, address });
}

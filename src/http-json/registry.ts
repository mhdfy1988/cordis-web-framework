import type { ApiRequestContext, JsonEndpoint } from '../contracts/http.ts';
import type { Cleanup } from '../contracts/runtime.ts';
import { ApiError } from './index.ts';
export { createStaticAssetRegistry } from './assets.ts';

/** 只管理动态端点与在途责任；HTTP 解析、身份和协议校验仍归宿主适配。 */
export function createJsonEndpointRegistry() {
  const entries = new Map<string, { endpoint: JsonEndpoint; active: Set<Promise<void>> }>();
  return Object.freeze({
    register(endpoint: JsonEndpoint): Cleanup {
      if (!['GET', 'POST', 'PUT'].includes(endpoint.method) || !/^\/extensions\/[a-zA-Z0-9/_-]+$/.test(endpoint.path)
        || typeof endpoint.execute !== 'function' || entries.size >= 128) throw new Error('动态端点无效或超过上限');
      const key = endpoint.method + ':' + endpoint.path;
      if (entries.has(key)) throw new Error('动态端点冲突');
      const entry = { endpoint: Object.freeze({ method: endpoint.method, path: endpoint.path, execute: endpoint.execute.bind(endpoint) }), active: new Set<Promise<void>>() };
      entries.set(key, entry);
      let closing: Promise<void> | undefined;
      return () => { if (!closing) { entries.delete(key); closing = Promise.all([...entry.active]).then(() => {}); } return closing; };
    },
    async execute(method: string, path: string, context: ApiRequestContext, body: unknown) {
      const entry = entries.get(method + ':' + path); if (!entry) throw new ApiError('not-found');
      const finished = Promise.withResolvers<void>(); entry.active.add(finished.promise);
      try { return await entry.endpoint.execute(context, body); } finally { finished.resolve(); entry.active.delete(finished.promise); }
    },
    inspect() { return Object.freeze({ endpoints: entries.size, active: [...entries.values()].reduce((sum, item) => sum + item.active.size, 0) }); },
  });
}

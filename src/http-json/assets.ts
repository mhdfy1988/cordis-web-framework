import type { StaticAsset } from '../contracts/http.ts';
import type { Cleanup } from '../contracts/runtime.ts';

export function createStaticAssetRegistry() {
  const assets = new Map<string, StaticAsset>();
  return Object.freeze({
    register(input: StaticAsset): Cleanup {
      if (!/^\/plugin-assets\/[a-zA-Z0-9_.-]+$/.test(input.path) || assets.has(input.path) || assets.size >= 128
        || !['text/html; charset=utf-8', 'text/javascript; charset=utf-8', 'text/css; charset=utf-8'].includes(input.contentType)
        || typeof input.content !== 'string' || new TextEncoder().encode(input.content).length > 4_194_304) throw new Error('动态资源无效、冲突或超限');
      const asset = Object.freeze({ ...input }); assets.set(asset.path, asset);
      return () => { if (assets.get(asset.path) === asset) assets.delete(asset.path); };
    },
    get(path: string) { return assets.get(path); },
    inspect() { return Object.freeze({ assets: assets.size }); },
  });
}

import { z } from 'zod';
import { service } from 'cordis-web-framework/runtime';
import type { CompositionDocument, PluginManifest, RegisteredPlugin } from 'cordis-web-framework/contracts/composition';
import type { PluginScope } from 'cordis-web-framework/runtime';
import { definePlugin } from 'cordis-web-framework/composition';
import { zodConfig } from 'cordis-web-framework/validation-zod';

export const numberService = service<{ read(): number }>('example/number');
export function metadata(id: string, changes: Partial<PluginManifest> = {}): PluginManifest {
  return { id, version: '1.0.0', apiVersion: '^1.0.0', requires: [], provides: [], ...changes };
}
export function plugin(manifest: PluginManifest, setup: (scope: PluginScope) => void = () => {}): RegisteredPlugin {
  return definePlugin({ manifest, config: zodConfig(z.strictObject({}).default({})), setup });
}
export function createCompositionFixture() {
  const calls: string[] = [];
  const resources = new Set<string>();
  const values: number[] = [];
  const provider = definePlugin({
    manifest: metadata('example/provider', { provides: [{ id: numberService.id, version: '1.2.0' }] }),
    config: zodConfig(z.strictObject({ value: z.number().int().default(42) }).default({ value: 42 })),
    setup(scope, config) {
      calls.push('provider');
      resources.add('provider');
      scope.onDispose(() => { resources.delete('provider'); calls.push('provider:stopped'); });
      scope.provide(numberService, { read: () => config.value });
    },
  });
  const consumer = plugin(metadata('example/consumer', { requires: [{ id: numberService.id, range: '^1.0.0' }] }), scope => {
    calls.push('consumer');
    values.push(scope.get(numberService).read());
    scope.onDispose(() => { calls.push(`consumer:stopped:${scope.get(numberService).read()}`); });
  });
  const catalog = new Map([['provider', provider], ['consumer', consumer]]);
  const document: CompositionDocument = {
    formatVersion: 1,
    // 故意让消费者在前，不能靠清单加载顺序决定服务绑定或就绪。
    plugins: [
      { id: 'example/consumer', version: '1.0.0', entry: 'consumer' },
      { id: 'example/provider', version: '1.0.0', entry: 'provider', config: { value: 7 } },
    ],
    bindings: { [numberService.id]: 'example/provider' },
  };
  return { calls, resources, values, provider, consumer, catalog, document };
}

import type { PluginDefinition } from 'cordis-web-framework/runtime';
import { service } from 'cordis-web-framework/runtime';

export const probe = service<{ read(): number }>('test/probe@1');

export function createProbes() {
  const events: string[] = [];
  const resources = new Set<string>();
  const reads: number[] = [];
  let generation = 0;
  const provider: PluginDefinition = {
    id: 'test/provider', provides: [probe],
    setup(scope) {
      const value = ++generation;
      const resource = `provider:${value}`;
      let open = true;
      resources.add(resource);
      scope.onDispose(() => {
        open = false;
        resources.delete(resource);
        events.push(`${resource}:closed`);
      });
      scope.provide(probe, { read() {
        if (!open) throw new Error('旧服务已关闭');
        return value;
      } });
      events.push(`${resource}:ready`);
    },
  };
  const consumer: PluginDefinition = {
    id: 'test/consumer', requires: [probe],
    setup(scope) {
      reads.push(scope.get(probe).read());
      events.push('consumer:ready');
      scope.onDispose(() => { events.push(`consumer:closed:${scope.get(probe).read()}`); });
    },
  };
  return { provider, consumer, events, resources, reads };
}

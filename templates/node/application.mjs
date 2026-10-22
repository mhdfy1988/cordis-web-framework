import { startNodeHost } from 'cordis-web-framework/hosts/node';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { definePlugin } from 'cordis-web-framework/composition';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { z } from 'zod';

export function startApplication() {
  const plugin = definePlugin({ manifest: { id: 'starter', version: '1.0.0', apiVersion: '^1', requires: [], provides: [] },
    config: zodConfig(z.strictObject({}).default({})), setup(scope) {
      // 实际应用在此登记自身资源，不直接使用 Cordis 对象。
      scope.onDispose(() => {});
    } });
  return startNodeHost({ document: { formatVersion: 1, plugins: [{ id: 'starter', version: '1.0.0', entry: 'starter' }], bindings: {} },
    catalog: new Map([['starter', plugin]]), createRuntime: createCordisRuntime });
}

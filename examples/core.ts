import { z } from 'zod';
import { resolveConfiguration } from 'cordis-web-framework/config';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { createLogger } from 'cordis-web-framework/logging';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { definePlugin, assembleComposition } from 'cordis-web-framework/composition';
import { createShutdownController } from 'cordis-web-framework/shutdown';

const parsed = resolveConfiguration([{ id: 'application', kind: 'override', values: { greeting: '框架公共核心已启动' } }],
  zodConfig(z.strictObject({ greeting: z.string() })));
if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
const logger = createLogger({ context: { instanceId: 'example' } });
const module = definePlugin({ manifest: { id: 'example', version: '1.0.0', apiVersion: '^1.0.0', requires: [], provides: [] },
  config: zodConfig(z.strictObject({ greeting: z.string() })), setup(scope, config) {
    const log = logger.child({ pluginId: 'example' });
    log.log('info', config.greeting);
    scope.onDispose(() => log.log('info', '资源已释放'));
  } });
const runtime = await assembleComposition({ formatVersion: 1, plugins: [{
  id: 'example', version: '1.0.0', entry: 'example', config: parsed.value.value,
}], bindings: {} }, new Map([['example', module]]), { createRuntime: createCordisRuntime });
logger.log('info', '就绪审计', { ready: runtime.audit().ready, origins: parsed.value.origins });
const result = await createShutdownController(runtime).stop();
logger.log('info', '关闭结果', { state: result.state });

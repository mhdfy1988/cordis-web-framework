import { service } from 'cordis-web-framework';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { assembleComposition, definePlugin, CompositionRejectedError } from 'cordis-web-framework/composition';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { resolveConfiguration } from 'cordis-web-framework/config';
import { createLogger } from 'cordis-web-framework/logging';
import { createShutdownController } from 'cordis-web-framework/shutdown';
import { z } from 'zod';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
export async function runCoreSmoke() {
  const configuration = resolveConfiguration([
    { id: 'defaults', kind: 'defaults', values: { amount: 3 } },
    { id: 'explicit', kind: 'override', values: { amount: 7 } },
  ], zodConfig(z.strictObject({ amount: z.number().int() })));
  assert(configuration.ok && configuration.value.value.amount === 7, '配置未按来源解析');
  const events = [];
  const logger = createLogger({ context: { instanceId: 'consumer' }, write: event => { events.push(event); } });
  const key = service('fixture/value');
  let read = 0;
  let released = 0;
  const catalog = new Map([
    ['provider', definePlugin({ manifest: { id: 'provider', version: '1.0.0', apiVersion: '^1.0.0', requires: [],
      provides: [{ id: key.id, version: '1.0.0' }] }, config: zodConfig(z.strictObject({ amount: z.number().int() })),
      setup(scope, config) {
        scope.provide(key, { amount: config.amount });
        scope.onDispose(() => { released++; });
      } })],
    ['consumer', definePlugin({ manifest: { id: 'consumer', version: '1.0.0', apiVersion: '^1.0.0',
      requires: [{ id: key.id, range: '^1.0.0' }], provides: [] }, config: zodConfig(z.strictObject({}).default({})),
      setup(scope) { read = scope.get(key).amount; logger.child({ pluginId: 'consumer' }).log('info', 'ready', { token: 'redact-me' }); } })],
  ]);
  const document = { formatVersion: 1, plugins: [
    { id: 'consumer', version: '1.0.0', entry: 'consumer' },
    { id: 'provider', version: '1.0.0', entry: 'provider', config: configuration.value.value },
  ], bindings: { [key.id]: 'provider' } };
  let created = 0;
  try {
    await assembleComposition({ ...document, bindings: {} }, catalog, { createRuntime() { created++; return createCordisRuntime(); } });
    throw new Error('错误装配被放行');
  } catch (error) { assert(error instanceof CompositionRejectedError, '预检错误没有保留公开错误类型'); }
  assert(created === 0, '错误方案创建了运行时');
  const runtime = await assembleComposition(JSON.stringify(document), catalog, { createRuntime: createCordisRuntime });
  const shutdown = createShutdownController(runtime);
  assert(runtime.audit().ready && read === 7, '合法装配未就绪');
  assert(events[0].fields.pluginId === 'consumer' && !JSON.stringify(events).includes('redact-me'), '日志上下文或脱敏失效');
  assert((await shutdown.stop()).state === 'stopped' && released === 1, '资源没有收尾');
  // 产物必须实际包含 PR #133：等待中的插件释放后终态为 stopped。
  const pendingRuntime = createCordisRuntime();
  const pending = pendingRuntime.load({ id: 'pending', requires: [service('missing')], setup() {} });
  await pending.settle();
  assert((await pending.stop()).state === 'stopped', '内置 Cordis 终态修复未生效');
  await pendingRuntime.close();
  return 'W1 isolated consumer passed';
}

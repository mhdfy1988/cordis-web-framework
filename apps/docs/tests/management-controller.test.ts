import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout, clearTimeout } from 'node:timers';
import { createCommandRegistry } from 'cordis-web-framework/commands';
import { createUiRegistry } from 'cordis-web-framework/ui';
import { createModules, type ModuleInputs } from '../application/plugins/modules.ts';
import { createSearch } from '../application/services/search.ts';
import { commandService, documentService, uiService } from '../application/services/contracts.ts';
import { definePlugin } from 'cordis-web-framework/composition';
import { startPluginManager, createMemoryPluginStore } from 'cordis-web-framework/management';
import { createNodePluginLoader } from 'cordis-web-framework/hosts/node/plugins';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { z } from 'zod';
import { createPluginController } from '../application/management/controller.ts';
let starts = 0; let releases = 0; let rejectStart = false;
const plugin = definePlugin({ manifest: { id: 'docs.outline', version: '1.0.0', apiVersion: '^1', requires: [], provides: [] },
  config: zodConfig(z.strictObject({}).prefault({})), setup(scope) { if (rejectStart) throw new Error('可观察启动失败'); starts++; scope.onDispose(() => { releases++; }); } });
const document = { formatVersion: 1 as const, plugins: [{ id: 'docs.outline', version: '1.0.0', entry: 'docs.outline' }], bindings: {} };
const controller = createPluginController({ document, catalog: new Map([['docs.outline', plugin]]),
  store: createMemoryPluginStore(), loader: createNodePluginLoader() });
const manager = await startPluginManager({ ...controller.management, runtime: createCordisRuntime(), environment: { platform: 'node', capabilities: [] } });
controller.attach(manager);
try {
  const first = controller.current('docs.outline')!.instanceId;
  for (let round = 0; round < 3; round++) {
    await controller.toggle('docs.outline'); assert.equal(controller.state('docs.outline'), 'not-loaded');
    await controller.toggle('docs.outline'); assert.equal(controller.state('docs.outline'), 'ready');
  }
  assert.notEqual(controller.current('docs.outline')!.instanceId, first);
  assert.equal(controller.snapshot.value!.plugins.length, 1, '管理投影只显示当前安装项，不靠历史数组猜状态');
  await controller.toggle('docs.foundation'); assert.equal(controller.error.value, '基础插件不可在此停用');
  await manager.disable('docs.outline');
  assert.equal(controller.state('docs.outline'), 'not-loaded', '程序接口操作同步到同一页面投影');
  await manager.enable('docs.outline'); assert.equal(controller.state('docs.outline'), 'ready');
  await controller.toggle('docs.outline'); rejectStart = true; await controller.toggle('docs.outline');
  assert.equal(controller.state('docs.outline'), 'failed'); assert.match(controller.error.value, /failed/);
  assert.ok(controller.current('docs.outline')!.diagnostics.length);
  assert.equal(starts, 5); assert.equal(releases, 5);
} finally { await manager.close(); }
assert.equal(controller.snapshot.value!.closed, true);
await assert.rejects(() => controller.toggle('docs.outline'), /已关闭/);
console.log('呈现与程序接口共用框架管理、重启、基础入口约束及失败投影通过');

test('真实搜索模块：索引请求挂起时停用先取消请求，再排空命令', { timeout: 5000 }, async () => {
  const runtime = createCordisRuntime(); const commands = createCommandRegistry(); const ui = createUiRegistry();
  const originalFetch = globalThis.fetch; let signal: AbortSignal | undefined; let rejectFetch: (error: Error) => void = () => {};
  globalThis.fetch = async (_input, options) => new Promise<Response>((_resolve, reject) => {
    signal = options?.signal ?? undefined; rejectFetch = reject;
    signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    runtime.load({ id: 'test-foundation', provides: [uiService, commandService, documentService], setup(scope) {
      scope.provide(uiService, ui); scope.provide(commandService, commands);
      scope.provide(documentService, {} as ModuleInputs['documents']);
    } });
    const module = createModules({ target: new EventTarget() as unknown as HTMLElement,
      createSearch: () => createSearch('/'), acceptSearch() {} } as unknown as ModuleInputs).find(item => item.manifest.id === 'docs.search')!;
    const configured = module.prepare({}); if (!configured.ok) assert.fail('搜索配置应合法');
    const handle = runtime.load({ id: module.manifest.id, requires: [uiService, commandService, documentService],
      provides: [ { id: 'docs.search' } ], setup: configured.value });
    await runtime.settle(); assert.equal(handle.inspect().state, 'ready');
    const running = commands.execute('docs.search', {}); await new Promise(resolve => setImmediate(resolve));
    assert.ok(signal);
    const stopping = handle.stop();
    const result = await Promise.race([stopping, new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), 1000); })]);
    assert.equal(signal.aborted, true, '停止应取消索引请求，不能等待请求自行返回');
    assert.equal(result?.state, 'stopped');
    assert.equal(await running, 'cancelled'); assert.equal(commands.inspect().running, 0);
    assert.equal(commands.inspect().commands, 0); assert.equal(ui.inspect().waiters, 0);
  } finally {
    clearTimeout(timer); rejectFetch(new Error('fixture-release')); globalThis.fetch = originalFetch;
    await runtime.close(); await commands.close(); ui.close();
  }
});

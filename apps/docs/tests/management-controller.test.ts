import assert from 'node:assert/strict';
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

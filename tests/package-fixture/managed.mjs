import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { startPluginManager } from 'cordis-web-framework/management';
import { createNodePluginLoader, createNodePluginStore } from 'cordis-web-framework/hosts/node/plugins';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';

const producer = resolve(process.argv[2]); const packageFile = resolve(producer, 'plugin.cwplugin.json');
const hash = () => createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex'); const before = hash();
const received = [];
const builtin = { manifest: { id: 'consumer', version: '1.0.0', apiVersion: '^1', requires: [{ id: 'example.greeting', range: '^1' }], provides: [] },
  prepare: () => ({ ok: true, value(scope) { received.push(scope.get({ id: 'example.greeting' }).say()); } }) };
const options = () => ({ runtime: createCordisRuntime(), store: createNodePluginStore(resolve(producer, 'installed.json')), loader: createNodePluginLoader(),
  environment: { platform: 'node', capabilities: [] }, builtins: [{ plugin: builtin, enabled: false, bindings: { 'example.greeting': 'placeholder' } }] });
const manager = await startPluginManager(options());
try {
  // 宿主已运行，才赋予全新身份并独立构建插件；主入口自身的字节不改变。
  const id = 'external-' + crypto.randomUUID(); const marker = 'after-start-' + crypto.randomUUID();
  const spec = JSON.parse(readFileSync(resolve(producer, 'plugin.json'), 'utf8')); spec.manifest.id = id;
  writeFileSync(resolve(producer, 'plugin.json'), JSON.stringify(spec));
  const result = spawnSync(process.execPath, ['build.mjs'], { cwd: producer, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const artifact = JSON.parse(readFileSync(packageFile, 'utf8'));
  await manager.install(artifact, { acceptedIntegrity: artifact.integrity, config: { message: marker } });
  assert.deepEqual(received, []); await manager.enable(id);
  await manager.configure('consumer', { config: {}, bindings: { 'example.greeting': id } }); await manager.enable('consumer');
  assert.deepEqual(received, [marker]);
  await manager.disable('consumer'); await manager.disable(id); assert.equal(hash(), before);
  await manager.close();
  const restoredOptions = options(); restoredOptions.builtins[0].bindings['example.greeting'] = id;
  const restored = await startPluginManager(restoredOptions);
  assert.equal(restored.inspect().plugins.find(item => item.id === id).enabled, false);
  await restored.configure('consumer', { config: {}, bindings: { 'example.greeting': 'placeholder' } });
  await restored.uninstall(id); await restored.close();
  assert.equal(JSON.parse(readFileSync(resolve(producer, 'installed.json'), 'utf8')).plugins.length, 1);
  assert.equal(hash(), before); console.log('工程外：公开包、独立构建、事后安装、真实服务调用与磁盘恢复通过');
} finally { if (!manager.inspect().closed) await manager.close(); }

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { startPluginManager } from 'cordis-web-framework/management';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { createNodePluginStore, createNodePluginLoader, createNodePackageRepository } from 'cordis-web-framework/hosts/node/plugins';

const directory = await mkdtemp(join(tmpdir(), 'cw-standard-template-'));
let manager;
try {
  manager = await startPluginManager({ runtime: createCordisRuntime(), environment: { platform: 'node', capabilities: [] },
    store: createNodePluginStore(join(directory, 'state.json')), loader: createNodePluginLoader(),
    packages: createNodePackageRepository({ directory: join(directory, 'packages') }), builtins: [{ enabled: false,
      bindings: { 'example.greeting': 'example.standard' }, plugin: {
        manifest: { id: 'template-observer', version: '1.0.0', apiVersion: '^1', requires: [{ id: 'example.greeting', range: '^1' }], provides: [] },
        prepare: () => ({ ok: true, value(scope) { assert.equal(scope.get({ id: 'example.greeting' }).message, '来自独立 npm 格式插件'); } }),
      } }] });
  // 宿主已经启动才打包，生产者与宿主没有一起构建。
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('请使用 npm.cmd run check');
  const packed = spawnSync(process.execPath, [npmCli, 'pack', '--ignore-scripts', '--json', '--pack-destination', directory], { encoding: 'utf8', windowsHide: true });
  assert.equal(packed.status, 0, packed.stderr);
  const file = JSON.parse(packed.stdout)[0].filename;
  await manager.installPackage({ type: 'file', path: join(directory, file) }, { acceptTrustedCode: true });
  assert.equal(manager.inspect().plugins.find(item => item.id === 'example.standard').enabled, false);
  await manager.enable('example.standard'); await manager.enable('template-observer');
  assert.ok(manager.inspect().plugins.every(item => item.state === 'ready'));
  await manager.disable('template-observer');
  // 消费者仍安装时拒绝卸载提供者，先解除显式绑定。
  await manager.configure('template-observer', { config: {}, bindings: {} });
  await manager.disable('example.standard'); await manager.uninstall('example.standard');
  assert.equal(manager.inspect().plugins.filter(item => !item.builtin).length, 0);
  console.log('独立 npm 模板消费、真实包管理器安装和生命周期检查通过');
} finally { await manager?.close(); await rm(directory, { recursive: true, force: true }); }

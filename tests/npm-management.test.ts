import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, readdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startNodeHost } from '../src/hosts/node/index.ts';
import { createCordisRuntime } from '../src/runtime-cordis/index.ts';
import { createNodePluginStore, createNodePluginLoader, createNodePackageRepository } from '../src/hosts/node/plugins.ts';
import { createNpmFixture } from './npm-fixture.ts';
import { startPluginManager } from '../src/plugin-management/index.ts';

test('N3 真宿主启动后安装未知 npm 包，不重建，三轮启停／磁盘恢复／卸载', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cw-npm-host-'));
  const global = globalThis as unknown as { __npmEvents: string[] }; global.__npmEvents = [];
  const library = join(directory, 'library'); const file = join(directory, 'state.json');
  const start = () => startNodeHost({ createRuntime: createCordisRuntime, document: { formatVersion: 1, plugins: [], bindings: {} }, catalog: new Map(),
    management: { packages: createNodePackageRepository({ directory: library }), store: createNodePluginStore(file), loader: createNodePluginLoader() } });
  let host = await start();
  try {
    const hashBefore = await readFile('dist/hosts/node/index.js', 'utf8');
    const fixture = await createNpmFixture(directory);
    await host.management!.installPackage({ type: 'file', path: fixture.path }, { acceptTrustedCode: true });
    assert.deepEqual(global.__npmEvents, []);
    for (let round = 0; round < 3; round++) {
      await host.management!.enable('npm-greeting'); assert.equal(host.management!.inspect().plugins[0].state, 'ready');
      await host.management!.disable('npm-greeting'); assert.equal(host.management!.inspect().plugins[0].enabled, false);
    }
    assert.equal(global.__npmEvents.filter(value => value === '独立多文件插件1.0.0').length, 3);
    assert.equal(global.__npmEvents.filter(value => value === 'released').length, 3);
    await host.stop(); host = await start();
    assert.equal(host.management!.inspect().plugins[0].enabled, false);
    await host.management!.enable('npm-greeting'); await host.stop(); host = await start();
    assert.equal(host.management!.inspect().plugins[0].state, 'ready');
    await host.management!.uninstall('npm-greeting');
    assert.deepEqual((await readdir(library)).filter(name => name.startsWith('pkg-')), []);
    assert.equal(hashBefore, await readFile('dist/hosts/node/index.js', 'utf8'));
    assert.equal((await fetch(host.address + '/health/ready')).status, 200);
    await host.stop(); host = await start(); assert.deepEqual(host.management!.inspect().plugins, []);
  } finally { await host.stop(); await rm(directory, { recursive: true, force: true }); }
});

test('N3 失败：双库独占、内容篡改、重复安装和取消不伪造安装结果', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cw-npm-failure-')); const library = join(directory, 'library');
  const repository = createNodePackageRepository({ directory: library });
  try {
    await repository.recover([]);
    await assert.rejects(createNodePackageRepository({ directory: library }).recover([]));
    const fixture = await createNpmFixture(directory);
    const cancelled = AbortSignal.abort();
    await assert.rejects(repository.stage({ type: 'file', path: fixture.path }, { acceptTrustedCode: true, signal: cancelled }));
    const artifact = await repository.stage({ type: 'file', path: fixture.path }, { acceptTrustedCode: true });
    await writeFile(join(library, artifact.key, 'node_modules', artifact.name, 'dist/helper.js'), 'tampered');
    await assert.rejects(repository.validate(artifact, { platform: 'node', capabilities: [] }), /完整性/);
    await repository.remove(artifact);
    await assert.rejects(repository.stage({ type: 'registry', name: '--help', version: '1.0.0' }, { acceptTrustedCode: true }));
  } finally { await repository.close(); await rm(directory, { recursive: true, force: true }); }
});

test('N8 标准包提交失败、中断孤立目录恢复，重复身份不留第二安装项', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cw-npm-commit-')); const library = join(directory, 'library');
  const file = join(directory, 'state.json'); const store = createNodePluginStore(file);
  const repository = createNodePackageRepository({ directory: library });
  let fail = true;
  const make = (packages = repository) => startPluginManager({ runtime: createCordisRuntime(), environment: { platform: 'node', capabilities: [] },
    loader: createNodePluginLoader(), packages, store: { ...store, async write(revision, document) {
      if (fail && document.plugins.some(item => item.package)) throw new Error('disk-full');
      await store.write(revision, document);
    } } });
  let manager = await make();
  try {
    const fixture = await createNpmFixture(directory);
    await assert.rejects(manager.installPackage({ type: 'file', path: fixture.path }, { acceptTrustedCode: true }), /disk-full/);
    assert.equal(manager.inspect().plugins.length, 0); await assert.rejects(manager.enable('npm-greeting'), /恢复/);
    await manager.close(); fail = false; manager = await make(createNodePackageRepository({ directory: library }));
    assert.equal((await readdir(library)).filter(name => name.startsWith('pkg-')).length, 0);
    await manager.installPackage({ type: 'file', path: fixture.path }, { acceptTrustedCode: true });
    await assert.rejects(manager.installPackage({ type: 'file', path: fixture.path }, { acceptTrustedCode: true }), /已安装/);
    assert.equal((await readdir(library)).filter(name => name.startsWith('pkg-')).length, 1);
    await manager.enable('npm-greeting'); await manager.uninstall('npm-greeting');
  } finally { await manager.close(); await rm(directory, { recursive: true, force: true }); }
});

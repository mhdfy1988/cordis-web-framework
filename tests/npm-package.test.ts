import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createNodePackageRepository } from '../src/hosts/node/package-repository.ts';
import { createNpmFixture } from './npm-fixture.ts';

test('N2 独立 npm 多文件包：真实 tgz、第三方依赖、资源与禁用脚本，安装不执行入口', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cw-npm-'));
  const repository = createNodePackageRepository({ directory: join(directory, 'library') });
  try {
    await repository.recover([]);
    const fixture = await createNpmFixture(directory);
    const global = globalThis as unknown as { __npmImports?: number }; delete global.__npmImports;
    const artifact = await repository.stage({ type: 'file', path: fixture.path }, { acceptTrustedCode: true });
    assert.equal(global.__npmImports, undefined);
    assert.equal(artifact.name, 'npm-greeting');
    assert.ok((await readFile(join(directory, 'library', artifact.key, 'package-lock.json'), 'utf8')).includes('semver'));
    assert.ok(!(await readdir(join(directory, 'library', artifact.key, 'node_modules', artifact.name))).includes('UNSAFE_SCRIPT'));
    await repository.validate(artifact, { platform: 'node', capabilities: [] });
    const lease = await repository.load(artifact, { platform: 'node', capabilities: [] });
    assert.equal(global.__npmImports, 1); assert.equal(lease.plugin.manifest.id, artifact.manifest.id);
    const portable = await repository.exportBrowser(artifact); assert.ok(portable.assets.icon.base64); assert.ok(portable.code.includes('npm-demo'));
    await lease.release(); await repository.remove(artifact);
  } finally { await repository.close(); await rm(directory, { recursive: true, force: true }); }
});

test('发布版本：根框架 peer 读取实际版本，拒绝旧固定版本并接受当前预发布', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cw-npm-peer-'));
  const repository = createNodePackageRepository({ directory: join(directory, 'library') });
  try {
    await repository.recover([]); const fixture = await createNpmFixture(directory, 'peer-example');
    const json = { ...fixture.json, peerDependencies: { 'cordis-web-framework': '0.0.0' } };
    await writeFile(join(fixture.source, 'package.json'), JSON.stringify(json));
    await assert.rejects(repository.stage({ type: 'file', path: fixture.source }, { acceptTrustedCode: true }), /peer/);
    json.peerDependencies['cordis-web-framework'] = JSON.parse(await readFile('package.json', 'utf8')).version;
    await writeFile(join(fixture.source, 'package.json'), JSON.stringify(json));
    const artifact = await repository.stage({ type: 'file', path: fixture.source }, { acceptTrustedCode: true });
    await repository.validate(artifact, { platform: 'node', capabilities: [] }); await repository.remove(artifact);
  } finally { await repository.close(); await rm(directory, { recursive: true, force: true }); }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodePluginStore } from '../src/hosts/node/plugin-store.ts';
import { createNodePluginLoader } from '../src/hosts/node/plugin-loader.ts';
import { artifactIntegrity } from '../src/plugin-management/artifact.ts';

test('P3 Node 安装库：独占、原子回读、修订冲突、释放与重新打开', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cw-management-'));
  try {
    const file = join(directory, 'state.json'); const store = createNodePluginStore(file);
    const release = await store.acquire();
    try {
      await assert.rejects(createNodePluginStore(file).acquire());
      await store.write(0, { formatVersion: 1, revision: 1, plugins: [] });
      assert.equal(JSON.parse(await readFile(file, 'utf8')).revision, 1);
      await assert.rejects(store.write(0, { formatVersion: 1, revision: 1, plugins: [] }), /修订/);
    } finally { await release(); }
    const reopened = createNodePluginStore(file); const unlock = await reopened.acquire();
    assert.equal((await reopened.read() as { revision: number }).revision, 1); await unlock();
  } finally { await rm(directory, { recursive: true }); }
});
test('P3 Node 真正 ESM 导入：独立代码、工厂身份校验、坏模块显式失败', async () => {
  const content = { formatVersion: 1 as const, manifest: { id: 'p3', version: '1.0.0', apiVersion: '^1', requires: [], provides: [] },
    entries: { node: 'export default manifest => ({manifest,prepare:()=>({ok:true,value(){}})})' }, assets: [] };
  const loader = createNodePluginLoader(); const environment = { platform: 'node' as const, capabilities: [] };
  const lease = await loader.load({ ...content, integrity: await artifactIntegrity(content) }, environment);
  assert.equal(lease.plugin.manifest.id, 'p3'); await lease.release();
  for (const node of ['export default 1', 'throw new Error("import-failed")', 'export default () => ({manifest:{},prepare(){}})']) {
    const bad = { ...content, entries: { node } };
    await assert.rejects(loader.load({ ...bad, integrity: await artifactIntegrity(bad) }, environment));
  }
});

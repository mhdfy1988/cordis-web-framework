import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { service } from 'cordis-web-framework';
import { definePlugin, assembleComposition } from 'cordis-web-framework/composition';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { createShutdownController } from 'cordis-web-framework/shutdown';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { z } from 'zod';
import { compileDocuments } from './compiler.ts';
import { applicationInputs, tree } from './integrity.ts';
import { buildDefaultUi } from '../packages/default-ui/build.ts';

await buildDefaultUi();
const typecheck = spawnSync(process.execPath, [resolve('node_modules/vue-tsc/bin/vue-tsc.js'), '--noEmit', '-p', 'tsconfig.json'], { stdio: 'inherit', windowsHide: true });
assert.equal(typecheck.status, 0, 'TypeScript／Vue 类型检查失败');
const base = process.env.DOCS_BASE_PATH ?? '/cordis-web-framework/'; assert.match(base, /^\/(?:[a-zA-Z0-9_-]+\/)*$/);
mkdirSync(resolve('output'), { recursive: true }); const generated = mkdtempSync(resolve('output/compiled-docs-'));
const key = service<{ compile(): Promise<void> }>('documentation.compiler');
let count = 0; let released = false;
const compiler = definePlugin({ manifest: { id: 'vitepress-compiler', version: '1.0.0', apiVersion: '^1', requires: [], provides: [{ id: key.id, version: '1.0.0' }] },
  config: zodConfig(z.strictObject({}).default({})), setup(scope) {
    scope.onDispose(() => { released = true; });
    scope.provide(key, { async compile() { scope.signal.throwIfAborted(); count = (await compileDocuments(generated, base)).pages.length; } });
  } });
const job = definePlugin({ manifest: { id: 'documentation-build', version: '1.0.0', apiVersion: '^1', requires: [{ id: key.id, range: '^1' }], provides: [] },
  config: zodConfig(z.strictObject({}).default({})), async setup(scope) { await scope.get(key).compile(); } });
const runtime = await assembleComposition({ formatVersion: 1, plugins: [
  { id: 'documentation-build', version: '1.0.0', entry: 'job' }, { id: 'vitepress-compiler', version: '1.0.0', entry: 'compiler' },
], bindings: { [key.id]: 'vitepress-compiler' } }, new Map([['job', job], ['compiler', compiler]]), { createRuntime: createCordisRuntime });
try { assert.equal(runtime.audit().ready, true); } finally { assert.equal((await createShutdownController(runtime).stop()).state, 'stopped'); }
assert.equal(released, true);
const outDir = resolve('output/documentation-site');
await build({ configFile: false, root: resolve('application'), base, plugins: [vue()], publicDir: false,
  build: { outDir, emptyOutDir: true, target: 'es2022', sourcemap: false, manifest: true } });
cpSync(generated, outDir, { recursive: true }); writeFileSync(resolve(outDir, '.nojekyll'), '');
cpSync(resolve('THIRD_PARTY_NOTICES.md'), resolve(outDir, 'third-party-licenses.txt'));
writeFileSync(resolve('output/full-site-build.json'), JSON.stringify({ base, outDir, pages: count, inputs: applicationInputs(), artifacts: tree(outDir), owner: 'cordis-web-framework/startVueHost', compiler: 'vitepress/createMarkdownRenderer', published: false }, null, 2));
console.log(`完整框架文档应用：${count} 页，${base}，仅静态文件；未部署`);

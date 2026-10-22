import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { Script } from 'node:vm';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { root, runNode, runNpm } from './run.mjs';
import { checkHostConsumer } from './package-host-check.mjs';
import { checkRecordsConsumer } from './package-records-check.mjs';
import { checkUiConsumer } from './package-ui-check.mjs';
import { checkPngConsumer } from './package-png-check.mjs';
import { checkGuideConsumer } from './guide-consumer.mjs';
import { checkManagementConsumer } from './package-management-check.mjs';
import { checkNpmConsumer } from './package-npm-check.mjs';

const require = createRequire(import.meta.url);
runNode(['scripts/build.mjs']);
runNode(['scripts/reference.mjs', 'check']);
const output = resolve(root, 'output');
mkdirSync(output, { recursive: true });
const packed = JSON.parse(runNpm(['pack', '--ignore-scripts', '--json', '--pack-destination', output], { encoding: 'utf8', stdio: 'pipe' }).stdout)[0];
const integrity = `sha512-${createHash('sha512').update(readFileSync(resolve(output, packed.filename))).digest('base64')}`;
assert.equal(integrity, packed.integrity);
assert.ok(packed.files.some(file => file.path === 'THIRD_PARTY_NOTICES.md'));
assert.ok(packed.files.some(file => file.path === 'docs/w1-core.md'));
assert.ok(!packed.files.some(file => file.path.startsWith('src/') || file.path.startsWith('tests/')));
// 放到工程目录外，防止 Node 向上找到本仓开发依赖造成假通过。
const consumer = mkdtempSync(resolve(tmpdir(), 'cordis-web-framework-w1-'));
const consumerLocation = relative(root, consumer);
assert.ok(isAbsolute(consumerLocation) || consumerLocation.startsWith(`..${sep}`), '消费目录必须位于工程外，含跨盘符情况');
cpSync(resolve(root, 'tests/package-fixture'), consumer, { recursive: true });
cpSync(resolve(root, 'examples/records'), resolve(consumer, 'records'), { recursive: true });
cpSync(resolve(root, 'examples/ui-workspace'), resolve(consumer, 'ui-workspace'), { recursive: true });
cpSync(resolve(root, 'tests/ui-browser-fixture.ts'), resolve(consumer, 'ui-browser-fixture.ts'));
runNpm(['install', resolve(output, packed.filename), '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: consumer });
const manifest = JSON.parse(readFileSync(resolve(consumer, 'node_modules/cordis-web-framework/package.json'), 'utf8'));
assert.equal(manifest.scripts.postinstall, undefined);
assert.equal(manifest.scripts.install, undefined);
assert.equal(manifest.scripts.preinstall, undefined);
assert.equal(manifest.version, packed.version);
assert.equal(existsSync(resolve(consumer, 'node_modules/cordis')), false, '消费方不应安装未修复 Cordis');
assert.equal(existsSync(resolve(consumer, 'node_modules/typescript')), false, '消费方只装生产依赖');
assert.equal(existsSync(resolve(consumer, 'node_modules/vue')), false, '非 Vue 消费者不强制安装 Vue');
assert.equal(existsSync(resolve(consumer, 'node_modules/vue-router')), false, '非界面消费者不强制安装路由');
runNode(['run.mjs'], { cwd: consumer });
runNode(['ui-core.mjs'], { cwd: consumer });
// 使用框架开发工具检查独立消费方的严格 NodeNext 类型，不从旧仓导入。
runNode([require.resolve('typescript/bin/tsc'), '-p', resolve(consumer, 'tsconfig.json')], { cwd: consumer });
const compiled = await build({ absWorkingDir: consumer, entryPoints: ['browser.mjs'],
  bundle: true, platform: 'browser', format: 'iife', target: 'es2022', write: false, metafile: true });
assert.ok(!Object.values(compiled.metafile.outputs).some(file => file.imports.some(item => item.external)));
assert.ok(!Object.keys(compiled.metafile.inputs).some(input => input.includes('fluid-block') || input.includes('../src/')));
const context = { crypto: globalThis.crypto, AbortController, setTimeout, clearTimeout, TextEncoder, TextDecoder };
new Script(compiled.outputFiles[0].text).runInNewContext(context, { timeout: 5000 });
assert.equal(await context.w1Result, 'W1 isolated consumer passed');
writeFileSync(resolve(consumer, 'browser-bundle.js'), compiled.outputFiles[0].text);
const hosts = await checkHostConsumer(consumer);
const fullstack = await checkRecordsConsumer(consumer);
const ui = await checkUiConsumer(consumer);
const pureBrowser = await checkPngConsumer(resolve(output, packed.filename));
assert.equal(pureBrowser.integrity, integrity, '两个业务必须消费同一包候选');
const guide = await checkGuideConsumer(resolve(output, packed.filename));
const management = await checkManagementConsumer(consumer, resolve(output, packed.filename));
const npmPlugins = await checkNpmConsumer(consumer, resolve(output, packed.filename));
assert.equal(management.integrity, integrity, '插件管理必须消费同一候选');
assert.equal(guide.integrity, integrity, '教程必须消费同一包候选');
writeFileSync(resolve(output, 'package-check-result.json'), JSON.stringify({
  consumer, tarball: resolve(output, packed.filename), node: true, nodeNext: true,
  integrity, sourceLockSha256: createHash('sha256').update(readFileSync(resolve(root, 'package-lock.json'))).digest('hex'),
  omitDev: true, ignoreScripts: true, cordisInstalled: false,
  browserBuild: true, browserLikeVm: true, realBrowser: hosts.realBrowser, hosts, fullstack, ui, pureBrowser, guide, management, npmPlugins,
}, null, 2));
console.log('独立生产安装、禁用脚本、Node 消费、NodeNext 类型、浏览器构建与无 Node 全局执行验证通过');

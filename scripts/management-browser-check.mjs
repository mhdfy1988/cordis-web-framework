import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import Fastify from 'fastify';
import { chromium } from 'playwright';
import { root } from './run.mjs';
import { artifactIntegrity } from '../dist/plugin-management/index.js';
import { sharedManagementFixture, checkSharedManagement } from './management-multitab-check.mjs';

const buildResult = await build({ absWorkingDir: root, entryPoints: ['tests/management-browser.ts'], bundle: true,
  format: 'esm', platform: 'browser', target: 'es2022', write: false, metafile: true,
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false', 'process.env.NODE_ENV': '"production"' } });
assert.ok(!Object.keys(buildResult.metafile.inputs).some(path => /hosts[\\/]node/.test(path)));
const js = buildResult.outputFiles[0].text;
const sharedJs = await sharedManagementFixture(root);
const server = Fastify();
let latePackage;
server.get('/late-plugin.json', (_req, reply) => latePackage ? reply.send(latePackage) : reply.code(404).send({ error: 'not-yet-produced' }));
server.get('/', (_req, reply) => reply.type('text/html').send('<!doctype html><title>管理契约验证</title><script type="module" src="/app.js"></script>'));
server.get('/app.js', (_req, reply) => reply.type('text/javascript').send(js));
server.get('/shared', (_req, reply) => reply.type('text/html').send('<!doctype html><title>多标签页管理验证</title><script type="module" src="/shared.js"></script>'));
server.get('/shared.js', (_req, reply) => reply.type('text/javascript').send(sharedJs));
const address = await server.listen({ host: '127.0.0.1', port: 0 });
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext(); const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(address);
  try { await page.locator('html[data-management="passed"]').waitFor({ timeout: 20000 }); }
  catch (error) { throw new AggregateError([error, ...errors], '浏览器管理夹具启动失败'); }
  // 直到宿主已经启动才生成独立代码；不修改或重新构建已服务的 app.js。
  const marker = 'AFTER-BOOT-' + crypto.randomUUID(); assert.ok(!js.includes(marker));
  const content = { formatVersion: 1, manifest: { id: 'late-package', version: '1.0.0', apiVersion: '^1',
    requires: [{ id: 'framework.presentation', range: '^1' }], provides: [] }, entries: { browser:
    `export default (manifest, assets) => ({manifest,prepare:()=>({ok:true,value(scope){const api=scope.get({id:'framework.presentation'});api.register(scope,{render(){return api.h('p',{id:'late-package'},${JSON.stringify(marker)})}},assets[0].source)}})})` },
    assets: [{ id: 'late-css', type: 'text/css', source: '#late-package { color: rgb(45, 67, 89); }' }] };
  latePackage = { ...content, integrity: await artifactIntegrity(content) };
  await page.evaluate(() => window.managementHarness.install());
  assert.equal(await page.locator('#late-package').count(), 0);
  await page.evaluate(() => window.managementHarness.enable());
  assert.equal(await page.locator('#late-package').innerText(), marker);
  assert.equal(await page.locator('#late-package').evaluate(element => getComputedStyle(element).color), 'rgb(45, 67, 89)');
  await page.evaluate(() => window.managementHarness.disable());
  assert.equal(await page.locator('#late-package').count(), 0);
  assert.equal(await page.evaluate(() => window.managementHarness.urls()), 0);
  await page.reload(); await page.locator('html[data-management="passed"]').waitFor({ timeout: 20000 });
  assert.equal(await page.evaluate(() => window.managementHarness.snapshot().plugins.find(plugin => plugin.id === 'late-package').enabled), false);
  await page.evaluate(() => window.managementHarness.enable()); assert.equal(await page.locator('#late-package').innerText(), marker);
  await page.evaluate(() => window.managementHarness.uninstall());
  await page.reload(); await page.locator('html[data-management="passed"]').waitFor({ timeout: 20000 });
  assert.equal(await page.evaluate(() => window.managementHarness.snapshot().plugins.some(plugin => plugin.id === 'late-package')), false);
  await page.evaluate(() => window.managementHarness.close());
  assert.equal(await page.evaluate(() => window.managementHarness.urls()), 0);
  assert.deepEqual(errors, []);
  const sharedTests = await checkSharedManagement(context, address);
  mkdirSync(resolve(root, 'output/management'), { recursive: true });
  writeFileSync(resolve(root, 'output/management/browser-result.json'), JSON.stringify({ passed: true, browser: browser.version(),
    tests: ['IndexedDB commit/read', 'shared-library connections', 'revision rejection', 'page reload persistence', 'ESM Blob import', 'invalid factory', ...sharedTests], temporaryAddress: address }, null, 2));
  console.log('P3/P5/P7 真实 Chrome 存储、动态界面、事后独立包、刷新恢复、卸载及原生 URL 释放通过');
} finally { await browser?.close(); await server.close(); }

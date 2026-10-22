import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import Fastify from 'fastify';
import { artifactIntegrity } from '../dist/plugin-management/index.js';
import { root, runNpm, runNode } from './run.mjs';

export async function checkManagementConsumer(consumer, tarball) {
  const producer = resolve(consumer, 'independent-plugin');
  cpSync(resolve(root, 'templates/plugin'), producer, { recursive: true });
  const pkg = JSON.parse(readFileSync(resolve(producer, 'package.json'), 'utf8'));
  pkg.dependencies['cordis-web-framework'] = 'file:' + tarball.replaceAll('\\', '/');
  writeFileSync(resolve(producer, 'package.json'), JSON.stringify(pkg));
  runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: producer });
  runNode(['managed.mjs', producer], { cwd: consumer });
  const producerIntegrity = JSON.parse(readFileSync(resolve(producer, 'package-lock.json'), 'utf8')).packages['node_modules/cordis-web-framework'].integrity;
  const consumerIntegrity = JSON.parse(readFileSync(resolve(consumer, 'package-lock.json'), 'utf8')).packages['node_modules/cordis-web-framework'].integrity;
  assert.equal(producerIntegrity, consumerIntegrity);
  // 将同一浏览器验收夹具改为明确公开入口，不复制框架实现或导入相邻 src/dist。
  let fixture = readFileSync(resolve(root, 'tests/management-late-browser.ts'), 'utf8');
  const replacements = { 'runtime-cordis/index': 'runtime-cordis', 'presentation-vue/index': 'presentation-vue',
    'presentation-vue/catalog': 'presentation-vue/catalog', 'presentation-vue/ui': 'presentation-vue/ui',
    'ui-registry/index': 'ui', 'hosts/browser/plugins': 'hosts/browser/plugins', 'contracts/runtime': 'runtime' };
  for (const [from, to] of Object.entries(replacements)) fixture = fixture.replaceAll('../src/' + from + '.ts', 'cordis-web-framework/' + to);
  assert.ok(!fixture.includes('../src/'));
  writeFileSync(resolve(consumer, 'managed-browser.ts'), fixture + '\nawait startLateHarness(); document.documentElement.dataset.management="passed";\n');
  const result = await build({ absWorkingDir: consumer, entryPoints: ['managed-browser.ts'], bundle: true, write: false,
    platform: 'browser', format: 'esm', target: 'es2022', metafile: true,
    define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false', 'process.env.NODE_ENV': '"production"' } });
  assert.ok(!Object.keys(result.metafile.inputs).some(path => /(?:^|\/)src\//.test(path) || path.includes('hosts/node/')));
  const js = result.outputFiles[0].text;
  const server = Fastify(); let artifact;
  server.get('/', (_request, reply) => reply.type('text/html').send('<!doctype html><script type="module" src="/app.js"></script>'));
  server.get('/app.js', (_request, reply) => reply.type('text/javascript').send(js));
  server.get('/late-plugin.json', (_request, reply) => artifact ? reply.send(artifact) : reply.code(404).send({}));
  const address = await server.listen({ host: '127.0.0.1', port: 0 }); let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true }); const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(address); await page.locator('html[data-management="passed"]').waitFor();
    const marker = 'isolated-after-boot-' + crypto.randomUUID(); assert.ok(!js.includes(marker));
    const content = { formatVersion: 1, manifest: { id: 'late-package', version: '1.0.0', apiVersion: '^1',
      requires: [{ id: 'framework.presentation', range: '^1' }], provides: [] }, entries: { browser:
      `export default (manifest,assets)=>({manifest,prepare:()=>({ok:true,value(scope){const api=scope.get({id:'framework.presentation'});api.register(scope,{render(){return api.h('p',{id:'isolated-plugin'},${JSON.stringify(marker)})}},assets[0].source)}})})` },
      assets: [{ id: 'css', type: 'text/css', source: '#isolated-plugin { color: rgb(34,56,78); }' }] };
    artifact = { ...content, integrity: await artifactIntegrity(content) };
    await page.evaluate(() => window.managementHarness.install()); assert.equal(await page.locator('#isolated-plugin').count(), 0);
    await page.evaluate(() => window.managementHarness.enable()); assert.equal(await page.locator('#isolated-plugin').innerText(), marker);
    await page.evaluate(() => window.managementHarness.disable()); await page.reload();
    await page.locator('html[data-management="passed"]').waitFor();
    assert.equal(await page.evaluate(() => window.managementHarness.snapshot().plugins.find(plugin => plugin.id === 'late-package').enabled), false);
    await page.evaluate(() => window.managementHarness.enable()); assert.equal(await page.locator('#isolated-plugin').innerText(), marker);
    await page.evaluate(() => window.managementHarness.uninstall()); await page.reload(); await page.locator('html[data-management="passed"]').waitFor();
    assert.equal(await page.evaluate(() => window.managementHarness.snapshot().plugins.some(plugin => plugin.id === 'late-package')), false);
    await page.evaluate(() => window.managementHarness.close()); assert.equal(await page.evaluate(() => window.managementHarness.urls()), 0);
    assert.deepEqual(errors, []);
    mkdirSync(resolve(root, 'output/management'), { recursive: true });
    const report = { integrity: consumerIntegrity, producerIntegrity, node: true, realChrome: true, browser: browser.version(),
      unknownAfterBoot: true, hostUnchanged: true, disabledRefresh: true, uninstallRefresh: true, nativeUrlsReleased: true, publicImportsOnly: true };
    writeFileSync(resolve(root, 'output/management/package-result.json'), JSON.stringify(report, null, 2)); return report;
  } finally { await browser?.close(); await server.close(); }
}

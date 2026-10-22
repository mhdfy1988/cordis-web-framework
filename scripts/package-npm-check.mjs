import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import Fastify from 'fastify';
import { chromium } from 'playwright';
import { root, runNpm } from './run.mjs';

export async function checkNpmConsumer(consumer, tarball) {
  const producer = resolve(consumer, 'standard-plugin');
  cpSync(resolve(root, 'templates/npm-plugin'), producer, { recursive: true });
  const json = JSON.parse(readFileSync(resolve(producer, 'package.json'), 'utf8'));
  json.devDependencies['cordis-web-framework'] = 'file:' + tarball.replaceAll('\\', '/');
  writeFileSync(resolve(producer, 'package.json'), JSON.stringify(json));
  runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: producer });
  runNpm(['run', 'build'], { cwd: producer }); runNpm(['run', 'check'], { cwd: producer });
  const integrity = JSON.parse(readFileSync(resolve(producer, 'package-lock.json'), 'utf8')).packages['node_modules/cordis-web-framework'].integrity;
  const expected = JSON.parse(readFileSync(resolve(consumer, 'package-lock.json'), 'utf8')).packages['node_modules/cordis-web-framework'].integrity;
  assert.equal(integrity, expected);
  let source = readFileSync(resolve(root, 'tests/npm-browser.ts'), 'utf8');
  for (const [from, to] of [
    ['../src/plugin-management/index.ts', 'cordis-web-framework/management'], ['../src/runtime-cordis/index.ts', 'cordis-web-framework/runtime-cordis'],
    ['../src/hosts/browser/plugins.ts', 'cordis-web-framework/hosts/browser/plugins'], ['../src/presentation-vue/management.ts', 'cordis-web-framework/presentation-vue/management'],
  ]) source = source.replaceAll(from, to);
  assert.ok(!source.includes('../src/'));
  writeFileSync(resolve(producer, 'browser-check.ts'), source);
  const compiled = await build({ absWorkingDir: producer, entryPoints: ['browser-check.ts'], bundle: true, format: 'esm', platform: 'browser', write: false,
    define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' } });
  const data = JSON.parse(readFileSync(resolve(producer, 'browser-plugin.json'), 'utf8'));
  const server = Fastify(); let browser;
  server.get('/app.js', (_req, reply) => reply.type('text/javascript').send(compiled.outputFiles[0].text));
  server.get('/package.json', (_req, reply) => reply.send(data));
  server.get('/', (_req, reply) => reply.type('text/html').send('<!doctype html><meta charset="utf-8"><div id="manager"></div><script type="module" src="/app.js"></script>'));
  const address = await server.listen({ host: '127.0.0.1', port: 0 });
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true }); const page = await browser.newPage();
    await page.goto(address); await page.locator('html[data-ready="true"]').waitFor();
    await page.evaluate(() => window.npmHarness.install());
    await page.evaluate(() => window.npmHarness.manager.enable('example.standard'));
    assert.equal(await page.evaluate(() => window.npmHarness.manager.inspect().plugins[0].state), 'ready');
    await page.evaluate(() => window.npmHarness.manager.close()); await page.reload(); await page.locator('html[data-ready="true"]').waitFor();
    assert.equal(await page.evaluate(() => window.npmHarness.manager.inspect().plugins[0].state), 'ready');
    await page.evaluate(() => window.npmHarness.manager.uninstall('example.standard'));
    await page.evaluate(() => window.npmHarness.manager.close()); assert.equal(await page.evaluate(() => window.npmHarness.urls()), 0);
    return { integrity, independentNpmProducer: true, nodeLifecycle: true, chrome: browser.version(), browserReload: true, publicImportsOnly: true };
  } finally { await browser?.close(); await server.close(); }
}

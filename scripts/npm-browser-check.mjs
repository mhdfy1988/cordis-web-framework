import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import Fastify from 'fastify';
import { chromium } from 'playwright';
import { createNpmFixture } from '../tests/npm-fixture.ts';
import { createNodePackageRepository } from '../dist/hosts/node/plugins.js';

const directory = await mkdtemp(join(tmpdir(), 'cw-npm-browser-'));
const repository = createNodePackageRepository({ directory: join(directory, 'library'), shared: { vue: {} } });
const compiled = await build({ entryPoints: ['tests/npm-browser.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false,
  define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' } });
const js = compiled.outputFiles[0].text;
let browser; const server = Fastify(); const staticServer = Fastify(); let data;
// 两个子路径：全栈提供与纯静态文件提供，均非用户常驻入口。
server.get('/*', async (request, reply) => {
  const path = request.url;
  if (path.endsWith('/app.js')) return reply.type('text/javascript').send(js);
  if (path.endsWith('/package.json')) return data ? reply.send(data) : reply.code(404).send({ error: 'not-installed' });
  return reply.type('text/html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>插件管理</title><style>body{margin:0;background:#f5f7fa;font-family:system-ui;color:#253043}main{max-width:1040px;margin:32px auto;padding:0 20px}h1{font-size:28px;margin-bottom:24px}</style><main><h1>插件管理</h1><div id="manager"></div><section id="plugin-content"></section></main><script type="module" src="./app.js"></script>');
});
const address = await server.listen({ host: '127.0.0.1', port: 0 });
try {
  await repository.recover([]);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext(); const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(address + '/fullstack/'); await page.locator('html[data-ready="true"]').waitFor();
  const fixture = await createNpmFixture(directory, 'npm-greeting', true);
  const artifact = await repository.stage({ type: 'file', path: fixture.path }, { acceptTrustedCode: true });
  data = await repository.exportBrowser(artifact);
  assert.ok(!js.includes(data.code));
  const portableFile = join(directory, 'browser-plugin.json'); await writeFile(portableFile, JSON.stringify(data));
  await page.getByLabel('浏览器插件包').setInputFiles(portableFile);
  assert.equal(await page.getByRole('button', { name: '安装插件', exact: true }).isDisabled(), true);
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '安装插件', exact: true }).click();
  await page.locator('[data-package="npm-greeting"]').waitFor(); assert.equal(await page.locator('#npm-demo').count(), 0);
  await mkdir('output/npm', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 }); await page.screenshot({ path: 'output/npm/manager-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'output/npm/manager-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  for (let round = 0; round < 3; round++) {
    if (round === 0) await page.locator('[data-package="npm-greeting"]').getByRole('button', { name: '启用', exact: true }).click();
    else await page.evaluate(() => window.npmHarness.manager.enable('npm-greeting'));
    await page.waitForFunction(() => {
      const element = document.querySelector('#npm-demo');
      return element !== null && getComputedStyle(element).color === 'rgb(45, 67, 89)';
    });
    await page.waitForFunction(() => document.querySelector('img')?.naturalWidth === 32);
    await page.evaluate(() => window.npmHarness.manager.disable('npm-greeting'));
    assert.equal(await page.locator('#npm-demo').count(), 0); assert.equal(await page.evaluate(() => window.npmHarness.urls()), 0);
  }
  await page.evaluate(() => window.npmHarness.manager.close()); await page.reload(); await page.locator('html[data-ready="true"]').waitFor();
  assert.equal(await page.evaluate(() => window.npmHarness.manager.inspect().plugins[0].enabled), false);
  await page.evaluate(() => window.npmHarness.manager.enable('npm-greeting'));
  await page.evaluate(() => window.npmHarness.manager.close()); await page.reload(); await page.locator('html[data-ready="true"]').waitFor();
  assert.equal(await page.locator('#npm-demo').count(), 1);
  await page.locator('[data-package="npm-greeting"]').getByRole('button', { name: '卸载', exact: true }).click();
  await page.getByRole('button', { name: '确认卸载', exact: true }).click();
  await page.locator('[data-package="npm-greeting"]').waitFor({ state: 'detached' });
  await page.evaluate(() => window.npmHarness.manager.close()); await page.reload(); await page.locator('html[data-ready="true"]').waitFor();
  assert.equal(await page.evaluate(() => window.npmHarness.manager.inspect().plugins.length), 0);
  await page.evaluate(() => window.npmHarness.checkFailedPreparation());
  assert.equal(await page.evaluate(() => window.npmHarness.urls()), 0);
  await page.evaluate(() => window.npmHarness.manager.close());
  // 关闭安装后端：第二入口只读取预先写好的静态文件。
  const staticRoot = join(directory, 'static'); await mkdir(staticRoot);
  await writeFile(join(staticRoot, 'package.json'), JSON.stringify(data)); await writeFile(join(staticRoot, 'app.js'), js);
  await writeFile(join(staticRoot, 'index.html'), '<!doctype html><meta name="viewport" content="width=device-width"><title>静态插件验收</title><main id="plugin-content"></main><script type="module" src="./app.js"></script>');
  staticServer.get('/*', async (request, reply) => {
    const name = request.url.endsWith('/app.js') ? 'app.js' : request.url.endsWith('/package.json') ? 'package.json' : 'index.html';
    return reply.type(name === 'app.js' ? 'text/javascript' : name === 'package.json' ? 'application/json' : 'text/html').send(await readFile(join(staticRoot, name)));
  });
  const staticAddress = await staticServer.listen({ host: '127.0.0.1', port: 0 });
  await server.close(); await repository.close();
  // 静态包导入在另一来源／安装库测试，不共享已有服务端安装状态。
  const staticContext = await browser.newContext(); const staticPage = await staticContext.newPage();
  await staticPage.goto(staticAddress + '/static/manual/'); await staticPage.locator('html[data-ready="true"]').waitFor();
  await staticPage.evaluate(() => window.npmHarness.install()); await staticPage.evaluate(() => window.npmHarness.manager.enable('npm-greeting'));
  assert.equal(await staticPage.locator('#npm-demo').count(), 1);
  await staticPage.evaluate(() => window.npmHarness.manager.close()); await staticPage.reload(); await staticPage.locator('html[data-ready="true"]').waitFor();
  assert.equal(await staticPage.locator('#npm-demo').count(), 1);
  await staticPage.evaluate(() => window.npmHarness.manager.disable('npm-greeting'));
  await staticPage.evaluate(() => window.npmHarness.manager.close()); await staticPage.reload(); await staticPage.locator('html[data-ready="true"]').waitFor();
  assert.equal(await staticPage.locator('#npm-demo').count(), 0);
  await staticPage.evaluate(() => window.npmHarness.manager.uninstall('npm-greeting'));
  await staticPage.evaluate(() => window.npmHarness.manager.close());
  assert.deepEqual(errors, []);
  await mkdir('output/npm', { recursive: true });
  await writeFile('output/npm/browser-result.json', JSON.stringify({ passed: true, browser: browser.version(), tests: ['late npm package export', 'real image/css', 'three release rounds', 'disable and enabled reload', 'uninstall reload', 'static nested base'], address }, null, 2));
  console.log('N4/N5 npm 浏览器交付、真实资源、三轮释放、刷新恢复及静态子路径通过');
} finally { await browser?.close(); await server.close(); await staticServer.close(); await repository.close(); await rm(directory, { recursive: true, force: true }); }

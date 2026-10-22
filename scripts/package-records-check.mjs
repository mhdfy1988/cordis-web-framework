import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { DatabaseSync } from 'node:sqlite';
import { runNode, runNpm } from './run.mjs';

export async function checkRecordsConsumer(consumer) {
  runNode(['records-consumer.mjs'], { cwd: consumer });
  // 先前已证明核心与无 Vue 浏览器宿主无需 Vue；仅这份 Vue 应用显式选择安装可选 peer。
  runNpm(['install', '--save-exact', 'vue@3.5.44', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: consumer });
  const result = await build({ absWorkingDir: consumer, entryPoints: ['records/browser/main.ts'], outfile: resolve(consumer, 'web/app.js'),
    bundle: true, platform: 'browser', format: 'esm', target: 'es2022', write: false, metafile: true,
    define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false', 'process.env.NODE_ENV': '"production"' } });
  const inputs = Object.keys(result.metafile.inputs);
  assert.ok(inputs.some(path => path.includes('node_modules/cordis-web-framework/dist/http-json/')));
  assert.ok(!inputs.some(path => /hosts[\\/]node|records[\\/]server|fluid-block|fastify|node:sqlite/.test(path)));
  const { startRecordsApplication } = await import(pathToFileURL(resolve(consumer, 'records/server/application.ts')).href);
  const databaseFile = resolve(consumer, 'records-browser.sqlite');
  const host = await startRecordsApplication({ localDemo: true, databaseFile, assets: [
    { path: '/', contentType: 'text/html; charset=utf-8', content: readFileSync(resolve(consumer, 'records/browser/index.html'), 'utf8') },
    { path: '/app.js', contentType: 'text/javascript; charset=utf-8', content: result.outputFiles.find(file => file.path.endsWith('.js')).text },
    { path: '/app.css', contentType: 'text/css; charset=utf-8', content: result.outputFiles.find(file => file.path.endsWith('.css')).text },
  ] });
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true }); const page = await browser.newPage();
    await page.goto(host.address); await page.getByRole('button', { name: '编辑者', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '已读取' }).waitFor();
    await page.getByLabel('标题', { exact: true }).fill('工程外真实浏览器保存');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
    const database = new DatabaseSync(databaseFile, { readOnly: true });
    assert.equal(database.prepare('SELECT title FROM records WHERE id = ?').get('second').title, '工程外真实浏览器保存'); database.close();
    return { nodePersistence: true, realBrowserSave: true, frameworkFromTarball: true, vueExplicitlyInstalledForSample: true, chrome: browser.version() };
  } finally { await browser?.close(); await host.stop(); }
}

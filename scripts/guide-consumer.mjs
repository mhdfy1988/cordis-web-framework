import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { root, runNode, runNpm } from './run.mjs';

/** 仅验证随包教程；W9 的只按文档开发新业务仍是独立验收。 */
export async function checkGuideConsumer(tarball) {
  const directory = mkdtempSync(resolve(tmpdir(), 'cordis-w7-guide-'));
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  writeFileSync(resolve(directory, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: {
    zod: pkg.dependencies.zod, vue: pkg.devDependencies.vue, esbuild: pkg.devDependencies.esbuild } }));
  runNpm(['install', tarball, '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: directory });
  assert.equal(existsSync(resolve(directory, 'node_modules/cordis-web-framework/src')), false);
  const docs = resolve(directory, 'node_modules/cordis-web-framework/docs');
  for (const file of ['plugins.mjs', 'http.mjs']) {
    cpSync(resolve(docs, 'examples', file), resolve(directory, file)); runNode([file], { cwd: directory });
  }
  cpSync(resolve(docs, 'examples/ui.mjs'), resolve(directory, 'tutorial.mjs'));
  cpSync(resolve(docs, 'examples/ui.html'), resolve(directory, 'tutorial.html'));
  runNpm(['exec', '--no', '--', 'esbuild', './tutorial.mjs', '--bundle', '--format=esm', '--platform=browser', '--outfile=./tutorial.js',
    '--define:__VUE_OPTIONS_API__=true', '--define:__VUE_PROD_DEVTOOLS__=false', '--define:__VUE_PROD_HYDRATION_MISMATCH_DETAILS__=false'], { cwd: directory });
  const { context } = await import(pathToFileURL(resolve(directory, 'node_modules/esbuild/lib/main.js')).href);
  const serving = await context({ absWorkingDir: directory }); let browser;
  const screenshots = resolve(root, 'output/guide-check'); mkdirSync(screenshots, { recursive: true });
  try {
    const address = await serving.serve({ host: '127.0.0.1', port: 0, servedir: directory });
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/tutorial.html`);
    await page.getByRole('heading', { name: '教程工作台' }).waitFor();
    const execute = page.getByRole('button', { name: '执行命令', exact: true });
    await execute.focus(); await page.keyboard.press('Enter');
    await page.getByRole('status').filter({ hasText: '已执行 1 次' }).waitFor();
    await page.screenshot({ path: resolve(screenshots, 'desktop-focus.png') });
    await page.setViewportSize({ width: 390, height: 700 }); await execute.hover();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: resolve(screenshots, 'narrow-hover.png') });
    await page.getByRole('button', { name: '停止应用', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '已停止' }).waitFor();
    assert.equal(await page.locator('#app').textContent(), ''); assert.equal(await page.getByRole('button', { name: '停止应用' }).isDisabled(), true);
    assert.deepEqual(errors, []);
    return { consumer: directory, integrity: `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`,
      pluginExample: true, actualHttp: true, packagedDocs: true, browserExample: true, keyboard: true, stopped: true,
      chrome: browser.version(), narrow: true, independentConsumer: true };
  } finally { await browser?.close(); await serving.dispose(); }
}

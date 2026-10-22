import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { serveDocumentation } from '../build/static-server.ts';

mkdirSync('output', { recursive: true });
const destination = mkdtempSync(resolve('output/default-ui-consumer-')); const npm = process.env.npm_execpath!;
assert.ok(npm, '请通过 npm.cmd test 执行');
function run(args: string[], cwd: string) {
  const result = spawnSync(process.execPath, [npm, ...args], { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stdout + result.stderr); return result.stdout;
}
const pack = JSON.parse(run(['pack', '--json', '--pack-destination', destination], resolve('packages/default-ui')))[0];
writeFileSync(resolve(destination, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: {
  '@cordis-web/default-ui': 'file:./' + pack.filename, 'cordis-web-framework': 'file:' + resolve('kit/framework.tgz').replaceAll('\\', '/'), vue: '3.5.44', zod: '4.6.7',
} }));
run(['install', '--ignore-scripts', '--no-audit', '--no-fund'], destination);
copyFileSync('tests/fixtures/default-ui.ts', resolve(destination, 'example.ts'));
const require = createRequire(import.meta.url);
const types = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--noUncheckedSideEffectImports', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--lib', 'ES2022,DOM,DOM.Iterable', 'example.ts'], { cwd: destination, encoding: 'utf8', windowsHide: true });
assert.equal(types.status, 0, types.stdout + types.stderr);
const bundle = await build({ entryPoints: [resolve(destination, 'example.ts')], bundle: true, platform: 'browser', format: 'esm', write: false,
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' } });
const url = 'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64');
copyFileSync(resolve(destination, 'node_modules/@cordis-web/default-ui/dist/default-ui.css'), resolve(destination, 'default-ui.css'));
writeFileSync(resolve(destination, 'index.html'), '<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>默认界面验收</title><link rel="stylesheet" href="./default-ui.css"><body style="margin:0"><div id="first"></div><div id="second"></div></body></html>');
const server = await serveDocumentation(destination, '/'); const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }); const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(server.url);
  await page.evaluate(async url => {
    const { createWorkbench } = await import(/* @vite-ignore */ url);
    const first = document.getElementById('first')!; first.style.setProperty('--cw-accent', '#123456'); first.dataset.theme = 'previous';
    const a = await createWorkbench(first); const b = await createWorkbench(document.getElementById('second')!);
    Object.assign(window, { acceptance: { a, b } });
  }, url);
  const control = (operation: string) => page.evaluate(async operation => {
    const { a } = (window as any).acceptance; return await a[operation]();
  }, operation);
  await page.locator('#first').getByRole('button', { name: '计数 0', exact: true }).click();
  await control('toggleTheme'); assert.equal(await page.locator('#first').getAttribute('data-theme'), 'dark');
  assert.equal(await page.locator('#second').getAttribute('data-theme'), 'light');
  await page.screenshot({ path: 'output/default-ui-workbench.png' });
  assert.equal(await control('stopTheme'), 'stopped'); assert.equal(await control('staleThemeRejected'), true);
  assert.equal(await page.locator('#first').getAttribute('data-theme'), 'previous');
  assert.equal(await page.locator('#first').evaluate(element => (element as HTMLElement).style.getPropertyValue('--cw-accent')), '#123456');
  assert.equal(await control('stopLayout'), 'stopped'); assert.equal(await page.locator('#first .default-shell').count(), 0);
  assert.equal(await page.locator('#second .default-shell').count(), 1);
  assert.equal(await control('replaceLayout'), 'ready'); await page.locator('#first [data-variant=topbar]').waitFor();
  await page.locator('#first').getByRole('button', { name: '计数 1', exact: true }).click();
  assert.equal(await page.locator('#first .shell-aside').count(), 0);
  assert.equal((await control('snapshot')).count, 2);
  await page.screenshot({ path: 'output/default-ui-replacement.png' });
  const result = await page.evaluate(async () => {
    const { a, b } = (window as any).acceptance; await a.close(); await b.close(); return { first: a.snapshot(), second: b.snapshot() };
  });
  for (const item of [result.first, result.second]) {
    assert.equal(item.ui.closed, true); assert.equal(item.ui.waiters, 0); assert.equal(item.ui.observers, 0); assert.equal(item.ui.contributions, 0);
    assert.deepEqual(item.runtime.diagnostics, []); assert.ok(item.runtime.plugins.every((plugin: any) => plugin.state === 'stopped'));
  }
  assert.deepEqual(errors, []);
  writeFileSync('output/default-ui-test.json', JSON.stringify({ destination, package: pack.filename, integrity: pack.integrity, browser: browser.version(), result,
    checks: ['packed-independent-consumer', 'strict-NodeNext-types', 'reject-invalid-config', 'two-instances', 'theme-isolation', 'restore-prior-theme', 'reject-stale-theme', 'stop-layout', 'replace-layout', 'retain-business-state', 'cleanup'], complete: true }, null, 2));
  console.log('默认界面：独立包安装、非文档消费、两实例隔离、布局替换和主题／退出清理通过');
} finally { await browser.close(); await server.close(); }

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { serveDocumentation } from '../build/static-server.ts';
import { verifyBuild, digest } from '../build/integrity.ts';

const build = JSON.parse(readFileSync('output/full-site-build.json', 'utf8')); verifyBuild(build);
const server = await serveDocumentation(build.outDir, build.base);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(); const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const row = (id: string) => page.locator(`[data-plugin="${id}"]`);
const state = async (id: string, expected: string) => row(id).locator(`[data-state="${expected}"]`).waitFor();
const manager = async () => { await page.goto(server.url + '#/plugins'); await page.getByRole('heading', { name: '插件管理', exact: true }).waitFor(); };
const back = async () => { await page.getByRole('link', { name: '← 返回文档', exact: true }).click(); await page.locator('.markdown-content h1').waitFor(); };
let releaseSearch: (() => void) | undefined;
try {
  await manager(); assert.equal(await page.locator('.plugin-row').count(), 12);
  // 同一浏览器上下文／同一安装库，不通过隔离上下文绕开多标签页问题。
  const peer = await page.context().newPage();
  peer.on('pageerror', error => errors.push(error.message));
  await peer.goto(server.url); await peer.locator('.markdown-content h1').waitFor();
  await peer.goto(server.url + '#/plugins');
  await peer.getByRole('heading', { name: '插件管理', exact: true }).waitFor();
  await row('docs.outline').getByRole('button', { name: '停用页内目录', exact: true }).click();
  await peer.locator('[data-plugin="docs.outline"] [data-state="not-loaded"]').waitFor();
  await peer.reload(); await peer.locator('[data-plugin="docs.outline"] [data-state="not-loaded"]').waitFor();
  await peer.locator('[data-plugin="docs.outline"]').getByRole('button', { name: '启用页内目录', exact: true }).click();
  await state('docs.outline', 'ready');
  await peer.getByRole('button', { name: '停止应用', exact: true }).click();
  await peer.getByRole('heading', { name: '文档应用已停止', exact: true }).waitFor();
  await peer.close();
  assert.equal(await row('docs.foundation').getByRole('button', { name: /停用/ }).count(), 0);
  const pendingSearch = new Promise<void>(resolve => { releaseSearch = resolve; });
  await page.route('**/search.json', async route => { await pendingSearch; await route.abort().catch(() => {}); });
  await back();
  const requested = page.waitForRequest('**/search.json');
  await page.getByRole('button', { name: /搜索文档/ }).click(); await requested;
  await page.keyboard.press('Escape'); await page.locator('dialog[open]').waitFor({ state: 'hidden' });
  await manager(); await row('docs.search').getByRole('button', { name: '停用文档搜索', exact: true }).click();
  await state('docs.search', 'not-loaded'); await state('docs.header', 'not-loaded');
  releaseSearch?.(); await page.unroute('**/search.json');
  await row('docs.search').getByRole('button', { name: '启用文档搜索', exact: true }).click(); await state('docs.search', 'ready');
  await page.screenshot({ path: 'output/plugin-manager-desktop.png' });
  for (let round = 0; round < 2; round++) {
    await row('ui.default-theme').getByRole('button', { name: '停用默认主题', exact: true }).click();
    await state('ui.default-theme', 'not-loaded'); await state('docs.theme-control', 'not-loaded');
    assert.equal(await page.locator('#app').getAttribute('data-theme'), null);
    await row('ui.default-theme').getByRole('button', { name: '启用默认主题', exact: true }).click();
    await state('ui.default-theme', 'ready'); await state('docs.theme-control', 'ready');
    assert.equal(await page.getByRole('alert').count(), 0);
  }
  await back(); await page.getByRole('button', { name: '切换深浅色主题' }).click();
  await page.waitForFunction(() => document.getElementById('app')?.dataset.theme === 'dark');
  await manager(); await page.screenshot({ path: 'output/plugin-manager-dark.png' });
  await back(); await page.getByRole('button', { name: '切换深浅色主题' }).click();
  await manager(); await row('docs.search').getByRole('button', { name: '停用文档搜索', exact: true }).click();
  await state('docs.search', 'not-loaded'); await state('docs.header', 'not-loaded');
  await back(); assert.equal(await page.locator('.search-trigger').count(), 0);
  await page.keyboard.press('Control+k'); assert.equal(await page.locator('dialog[open]').count(), 0);
  await manager(); await row('docs.search').getByRole('button', { name: '启用文档搜索', exact: true }).click();
  await state('docs.search', 'ready'); await state('docs.header', 'ready');
  await back(); await page.getByRole('button', { name: /搜索文档/ }).click();
  await page.locator('#document-search').fill('插件'); await page.locator('dialog nav a').first().waitFor(); await page.keyboard.press('Escape');
  await manager(); await row('docs.outline').getByRole('button', { name: '停用页内目录', exact: true }).click();
  await state('docs.outline', 'not-loaded'); await back(); assert.equal(await page.locator('.outline-links').count(), 0);
  await manager(); await row('docs.outline').getByRole('button', { name: '启用页内目录', exact: true }).click(); await state('docs.outline', 'ready');
  await page.getByRole('button', { name: '顶部布局', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>('button')]
    .some(button => button.textContent === '顶部布局' && !button.disabled && button.getAttribute('aria-pressed') === 'true'));
  await page.reload(); await page.getByRole('button', { name: '顶部布局', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '顶部布局', exact: true }).getAttribute('aria-pressed'), 'true');
  await state('ui.default-layout', 'ready'); await back(); await page.locator('[data-variant="topbar"]').waitFor();
  await page.locator('.topbar-chapters details').first().locator('summary').click();
  await page.locator('.topbar-chapters details').first().getByRole('link').first().click();
  await page.screenshot({ path: 'output/plugin-manager-topbar-document.png' });
  await page.getByRole('link', { name: '插件管理', exact: true }).click();
  await page.getByRole('heading', { name: '插件管理', exact: true }).waitFor();
  await row('ui.default-layout').getByRole('button', { name: '停用默认布局', exact: true }).click();
  await state('ui.default-layout', 'not-loaded'); await page.getByRole('button', { name: '恢复默认布局', exact: true }).waitFor();
  assert.equal(await page.locator('.plugin-manager').count(), 1); assert.equal(await page.getByRole('link', { name: '← 返回文档', exact: true }).count(), 0);
  await page.screenshot({ path: 'output/plugin-manager-layout-stopped.png' });
  await page.goto(server.url + '#/guide/plugins'); await page.getByRole('button', { name: '恢复默认布局', exact: true }).waitFor();
  await page.getByRole('button', { name: '恢复默认布局', exact: true }).click(); await page.locator('.markdown-content h1').waitFor(); await manager(); await state('ui.default-layout', 'ready');
  await back(); await page.locator('[data-variant="sidebar"]').waitFor(); await page.locator('.outline-links a').first().waitFor();
  await manager(); await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'output/plugin-manager-mobile.png' });
  await page.reload(); await state('ui.default-layout', 'ready'); assert.equal(await page.getByRole('alert').count(), 0);
  // 真正刷新并重建宿主，不能只检查同一次运行的停用快照。
  for (const [id, name] of [['ui.default-theme', '默认主题'], ['docs.search', '文档搜索'], ['docs.outline', '页内目录'], ['ui.default-layout', '默认布局']]) {
    await row(id).getByRole('button', { name: '停用' + name, exact: true }).click(); await state(id, 'not-loaded');
  }
  await page.reload();
  for (const id of ['ui.default-theme', 'docs.theme-control', 'docs.search', 'docs.header', 'docs.outline', 'ui.default-layout']) await state(id, 'not-loaded');
  assert.equal(await page.locator('#app').getAttribute('data-theme'), null);
  assert.equal(await page.locator('.runtime-state').innerText(), '6 / 12 运行中');
  await page.goto(server.url + '#/guide/plugins'); await page.reload();
  await page.getByRole('button', { name: '恢复默认布局', exact: true }).waitFor();
  assert.equal(await page.locator('.default-shell').count(), 0);
  await page.screenshot({ path: 'output/plugin-manager-persisted-off.png' });
  await page.getByRole('button', { name: '恢复默认布局', exact: true }).click(); await page.locator('.markdown-content h1').waitFor();
  assert.equal(await page.locator('.search-trigger').count(), 0); assert.equal(await page.locator('.outline-links').count(), 0);
  assert.equal(await page.getByRole('button', { name: '切换深浅色主题' }).count(), 0);
  await manager();
  for (const [id, name] of [['ui.default-theme', '默认主题'], ['docs.search', '文档搜索'], ['docs.outline', '页内目录']]) {
    await row(id).getByRole('button', { name: '启用' + name, exact: true }).click(); await state(id, 'ready');
  }
  await page.reload();
  for (const id of ['ui.default-theme', 'docs.theme-control', 'docs.search', 'docs.header', 'docs.outline', 'ui.default-layout']) await state(id, 'ready');
  assert.equal(await page.getByRole('alert').count(), 0);
  await page.getByRole('button', { name: '停止应用', exact: true }).click(); await page.getByRole('heading', { name: '文档应用已停止', exact: true }).waitFor();
  const stopped = JSON.parse(await page.locator('#application-state pre').innerText());
  assert.equal(stopped.shutdown.state, 'stopped'); assert.deepEqual(stopped.shutdown.runtime.diagnostics, []);
  for (const field of ['waiters', 'observers', 'contributions', 'cleanupFailures']) assert.equal(stopped.ui[field], 0);
  assert.deepEqual(errors, []);
  writeFileSync('output/plugin-manager-test.json', JSON.stringify({ build: digest('output/full-site-build.json'), source: digest('tests/management.test.ts'), browser: browser.version(), errors, stopped,
    checks: ['manager-deep-link', 'locked-foundation', 'repeated-theme-restart', 'theme-controls-after-restart', 'search-stop-shortcut-and-restart', 'outline-restart', 'layout-switch', 'layout-stop-recovery', 'mobile', 'persist-layout-selection', 'persist-all-disabled-with-dependencies', 'refresh-document-without-layout-recovery', 'persist-reenabled', 'cleanup'], complete: true }, null, 2));
  console.log('插件管理：真实启停、依赖联动、布局切换／恢复、窄屏与完整关闭通过');
} catch (error) { await page.screenshot({ path: 'output/plugin-manager-failure.png', fullPage: true }); throw error; }
finally { releaseSearch?.(); await browser.close(); await server.close(); }

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { serveDocumentation } from '../build/static-server.ts';
import { verifyBuild, digest } from '../build/integrity.ts';

const build = JSON.parse(readFileSync('output/full-site-build.json', 'utf8')); verifyBuild(build);
const server = await serveDocumentation(build.outDir, build.base);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
try {
  await page.addInitScript(base => localStorage.setItem('cordis-docs:' + base + ':plugins:v1', JSON.stringify({ formatVersion: 1, disabled: [], variant: 'topbar' })), build.base);
  await page.goto(server.url); await page.locator('.markdown-content h1').waitFor();
  const category = page.locator('.topbar-chapters details').first(); await category.locator('summary').click();
  const panel = category.locator('div'); await panel.waitFor();
  const geometry = await panel.evaluate(element => {
    const rect = element.getBoundingClientRect(); const nav = element.closest('.shell-navigation')!;
    return { top: rect.top, bottom: rect.bottom, navBottom: nav.getBoundingClientRect().bottom, overflow: getComputedStyle(nav).overflowY };
  });
  const hit = await category.locator('a').last().evaluate(element => {
    const rect = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  });
  await page.screenshot({ path: 'output/topbar-expanded.png' });
  writeFileSync('output/topbar-test.json', JSON.stringify({ build: digest('output/full-site-build.json'), geometry, hit, errors, complete: hit }, null, 2));
  assert.ok(hit, '顶部菜单末项必须真正呈现在导航条之外，不能被祖先滚动容器裁切：' + JSON.stringify(geometry));
  await category.locator('a').last().click(); await page.locator('.markdown-content h1').waitFor();
  assert.equal(await category.getAttribute('open'), null);
  await category.locator('summary').click(); await page.keyboard.press('Escape'); assert.equal(await category.getAttribute('open'), null);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '章节', exact: true }).click();
  await category.locator('summary').click(); await category.locator('a').last().click();
  await page.locator('.shell-navigation').waitFor({ state: 'hidden' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  writeFileSync('output/topbar-test.json', JSON.stringify({ build: digest('output/full-site-build.json'), geometry, hit, errors, checks: ['desktop-unclipped-hit-test', 'last-link-navigation', 'escape', 'mobile-inline-menu'], complete: true }, null, 2));
  console.log('顶部导航：展开菜单实际命中、末项跳转、Esc 与窄屏菜单通过');
} finally { await browser.close(); await server.close(); }

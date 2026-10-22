import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { root, runNode } from './run.mjs';
import { startDocsStatic } from './docs-static.mjs';
runNode(['scripts/docs-build.mjs'], { timeout: 180000 });
const host = await startDocsStatic(); const screenshots = resolve(root, 'output/docs-check'); mkdirSync(screenshots, { recursive: true });
let browser; let page; const errors = []; const unexpected = [];
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: host.origin });
  page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) unexpected.push(`${response.status()} ${response.url()}`); });
  await page.goto(host.address); await page.getByRole('heading', { name: /^Cordis Web Framework/ }).waitFor();
  await page.screenshot({ path: resolve(screenshots, 'home-desktop.png') });
  await page.goto(host.origin + host.base + 'guide/getting-started.html'); await page.reload();
  await page.getByRole('heading', { name: /^快速开始/ }).waitFor();
  const codeBlock = page.locator('.vp-doc div[class*="language-"]').first(); await codeBlock.hover();
  const copy = codeBlock.locator('button.copy'); await copy.focus(); await page.keyboard.press('Enter');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText()); assert.ok(clipboard.includes('npm.cmd ci'));
  await page.screenshot({ path: resolve(screenshots, 'quickstart-copy.png') });
  await page.getByRole('button', { name: '搜索文档', exact: true }).click();
  const search = page.locator('.VPLocalSearchBox input'); await search.fill('编写第一个插件');
  const result = page.locator('.VPLocalSearchBox a').filter({ hasText: '编写第一个插件' }).first(); await result.waitFor();
  await page.screenshot({ path: resolve(screenshots, 'search-chinese.png') });
  await page.keyboard.press('Escape'); await page.locator('.VPLocalSearchBox').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '搜索文档');
  await page.getByRole('button', { name: '搜索文档', exact: true }).click(); await page.locator('.VPLocalSearchBox input').fill('编写第一个插件');
  await page.locator('.VPLocalSearchBox a').filter({ hasText: '编写第一个插件' }).first().click();
  await page.getByRole('heading', { name: /^编写第一个插件/ }).waitFor();
  assert.ok(page.url().startsWith(host.origin + host.base));
  await page.getByRole('switch').click(); await page.screenshot({ path: resolve(screenshots, 'plugin-dark.png') });
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForFunction(() => document.querySelector('.VPSidebar').getBoundingClientRect().right <= 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: resolve(screenshots, 'plugin-narrow.png') });
  await page.getByRole('button', { name: '文档导航', exact: true }).click();
  await page.locator('.VPSidebar').getByRole('link', { name: '运行与装配', exact: true }).click();
  await page.getByRole('heading', { name: /^运行与插件装配/ }).waitFor();
  await page.waitForFunction(() => document.querySelector('.VPSidebar').getBoundingClientRect().right <= 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: resolve(screenshots, 'api-narrow.png') });

  // 在浏览器 DOMParser 中核对实际生成的 HTML 链接和锚点，不自制 HTML 解析器。
  const rendered = await page.evaluate(async ({ base, pages }) => {
    const cache = new Map(); let count = 0;
    const load = async path => {
      if (cache.has(path)) return cache.get(path);
      const response = await fetch(path); if (!response.ok) throw new Error(`页面不可获取：${path}`);
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html'); cache.set(path, doc); return doc;
    };
    for (const page of pages) {
      const path = base + page.replace(/\.md$/, '.html'); const doc = await load(path);
      for (const anchor of doc.querySelectorAll('a[href]')) {
        const target = new URL(anchor.getAttribute('href'), location.origin + path);
        if (target.origin !== location.origin) continue;
        if (!target.pathname.startsWith(base)) throw new Error(`链接越过子路径：${target.pathname}`);
        if (target.pathname.endsWith('.txt')) { const reply = await fetch(target); if (!reply.ok) throw new Error('源码链接失败'); continue; }
        const destination = await load(target.pathname);
        if (target.hash && !destination.getElementById(decodeURIComponent(target.hash.slice(1)))) throw new Error(`产物锚点不存在：${target.href}`);
        count++;
      }
    }
    return { pages: cache.size, links: count };
  }, { base: host.base, pages: host.report.pages });
  for (const file of ['plugins.mjs', 'http.mjs', 'ui.mjs', 'ui.html']) {
    const reply = await fetch(host.origin + host.base + `examples/${file}.txt`);
    assert.equal(reply.status, 200); assert.equal(await reply.text(), readFileSync(resolve(root, 'docs/examples', file), 'utf8'));
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  const report = { productionBuild: true, base: host.base, chrome: browser.version(), chineseSearch: true, searchNavigation: true,
    copy: true, searchEscapeFocus: true, deepRefresh: true, dark: true, narrow: true, rendered, sourceDownloads: true, localOnly: true };
  writeFileSync(resolve(root, 'output/docs-check-result.json'), JSON.stringify(report, null, 2)); console.log('文档站生产产物验收通过', report);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: resolve(screenshots, 'failure.png') });
  throw new Error(`文档站验收失败；页面错误=${JSON.stringify(errors)}；HTTP=${JSON.stringify(unexpected)}`, { cause: error });
} finally { await browser?.close(); await host.server.close(); }

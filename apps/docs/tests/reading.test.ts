import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { serveDocumentation } from '../build/static-server.ts';
import { verifyBuild, digest } from '../build/integrity.ts';

const report = JSON.parse(readFileSync('output/full-site-build.json', 'utf8'));
verifyBuild(report);
const markdown = readFileSync('content/editions/reference/ui.md', 'utf8');
const example = markdown.match(/### 最小示例[\s\S]*?```ts\n([\s\S]*?)```/)?.[1];
assert.ok(example, '导航示例必须来自实际展示的文档，不另写测试替身');
const bundle = await build({ stdin: { contents: example, resolveDir: resolve('.'), loader: 'ts' }, bundle: true, platform: 'browser', format: 'esm', write: false,
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' } });
const exampleUrl = 'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64');
const server = await serveDocumentation(report.outDir, report.base);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.goto(server.url + '#/reference/ui?section=createvuenavigation');
  await page.locator('.markdown-content #createvuenavigation').waitFor();
  assert.ok(await page.locator('.markdown-content h3').count() >= 10);
  assert.ok(await page.locator('.markdown-content button.copy').count() >= 8);
  await page.screenshot({ path: 'output/reading-navigation-desktop.png' });
  const sample = await page.evaluate(async url => {
    const module = await import(/* @vite-ignore */ url);
    return await module.inspectRoutes();
  }, exampleUrl);
  assert.deepEqual(sample, { current: 'guide', path: '/guide', menu: ['使用指南'] });
  const geometry = await page.locator('.markdown-content').evaluate(element => ({ width: element.getBoundingClientRect().width, font: getComputedStyle(element).fontFamily }));
  assert.ok(geometry.width <= 720);
  assert.ok(geometry.font.includes('system-ui'));
  const token = page.locator('.markdown-content .shiki span[style*="--shiki-light"]').first();
  const lightColor = await token.evaluate(element => getComputedStyle(element).color);
  await page.goto(server.url + '#/reference/ui?section=' + encodeURIComponent('最小示例'));
  await page.locator('.markdown-content #最小示例').waitFor();
  await page.screenshot({ path: 'output/reading-navigation-example.png' });
  await page.getByRole('button', { name: '切换深浅色主题' }).click();
  await page.waitForFunction(() => document.querySelector('#app')?.getAttribute('data-theme') === 'dark');
  const darkColor = await token.evaluate(element => getComputedStyle(element).color);
  assert.notEqual(lightColor, darkColor, '两种主题应使用各自的代码高亮色');
  await page.screenshot({ path: 'output/reading-navigation-dark.png' });
  await page.getByRole('button', { name: '切换深浅色主题' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(server.url + '#/reference/ui?section=createvuenavigation');
  await page.locator('.markdown-content #createvuenavigation').waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'output/reading-navigation-mobile.png' });
  await page.setViewportSize({ width: 1536, height: 960 });
  for (const [route, section, name] of [
    ['/reference/core', 'defineplugin', 'plugins'],
    ['/reference/foundation', 'resolveconfiguration', 'configuration'],
    ['/reference/hosts-http', 'json-操作、端点与客户端', 'http'],
    ['/guide/concepts', '默认界面与应用界面', 'interface-boundary'],
    ['/guide/plugins', '完整源码', 'tutorial-source'],
  ]) {
    await page.goto(server.url + '#' + route + '?section=' + encodeURIComponent(section));
    const title = section === 'defineplugin' ? 'definePlugin' : section === 'resolveconfiguration' ? 'resolveConfiguration' : section === 'json-操作、端点与客户端' ? 'JSON 操作、端点与客户端' : section;
    const heading = page.locator('.markdown-content').getByRole('heading', { name: title });
    await heading.waitFor();
    await heading.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `output/reading-${name}.png` });
  }
  assert.deepEqual(errors, []);
  writeFileSync('output/reading-test.json', JSON.stringify({ build: digest('output/full-site-build.json'), testSource: digest('tests/reading.test.ts'), sample, geometry, lightColor, darkColor, browser: browser.version(), errors, complete: true }, null, 2));
  console.log('阅读样板：实际文档示例执行、桌面／窄屏排版与深色检查通过');
} finally { await browser.close(); await server.close(); }

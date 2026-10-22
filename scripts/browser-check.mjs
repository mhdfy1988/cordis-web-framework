import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { root, runNode } from './run.mjs';

runNode(['scripts/build.mjs']);
const out = resolve(root, 'output/browser'); mkdirSync(out, { recursive: true });
const result = await build({ absWorkingDir: root, entryPoints: ['tests/browser-fixture/main.ts'],
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, metafile: true,
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false', 'process.env.NODE_ENV': '"production"' } });
const js = result.outputFiles[0].text;
assert.ok(!Object.keys(result.metafile.inputs).some(input => /hosts[\\/]node|fastify|node:/.test(input)), '浏览器构建不得包含 Node 宿主');
assert.ok(!js.includes('W2_SERVER_ONLY_SECRET'), '服务端秘密不得出现在浏览器产物');
assert.ok(!Object.values(result.metafile.outputs).some(output => output.imports.some(item => item.external)));
writeFileSync(resolve(out, 'app.js'), js);
writeFileSync(resolve(out, 'bundle-meta.json'), JSON.stringify(result.metafile, null, 2));
// 测试服务器只服务内存夹具，不读取路径，不与用户已有入口共享实例。
const html = readFileSync(resolve(root, 'tests/browser-fixture/index.html'), 'utf8');
// 仅测试服务器需要原始响应类型，Fastify 不暴露给框架消费者。
const { default: Fastify } = await import('fastify');
const server = Fastify();
server.get('/', (_request, reply) => reply.type('text/html; charset=utf-8').send(html));
server.get('/app.js', (_request, reply) => reply.type('text/javascript; charset=utf-8').send(js));
const address = await server.listen({ host: '127.0.0.1', port: 0 });
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(address);
  await page.locator('html[data-contracts="passed"]').waitFor();
  const a = page.getByRole('region', { name: '实例 A' });
  const b = page.getByRole('region', { name: '实例 B' });
  await a.getByRole('button', { name: '能力拒绝', exact: true }).click();
  await a.getByRole('status').filter({ hasText: '能力不匹配' }).waitFor();
  assert.equal(await a.locator('.resources').innerText(), '资源 0 · 实例创建 0');
  for (const label of ['挂载失败', '中途失败']) {
    await a.getByRole('button', { name: label, exact: true }).click();
    await a.getByRole('status').filter({ hasText: '启动失败，已回收' }).waitFor();
    assert.equal(await a.locator('.target').innerText(), '');
    assert.ok((await a.locator('.resources').innerText()).startsWith('资源 0'));
  }
  for (const card of [a, b]) {
    await card.getByRole('button', { name: '启动', exact: true }).click();
    await card.getByRole('status').filter({ hasText: '已就绪' }).waitFor();
  }
  await a.getByRole('button', { name: '计数 0', exact: true }).click();
  assert.equal(await b.getByRole('button', { name: '计数 0', exact: true }).count(), 1);
  await page.screenshot({ path: resolve(out, 'desktop.png') });
  await a.getByRole('button', { name: '停止', exact: true }).click();
  await a.getByRole('status').filter({ hasText: '已停止' }).waitFor();
  assert.equal(await a.locator('.target').innerText(), '');
  assert.ok((await a.locator('.resources').innerText()).startsWith('资源 0'));
  await b.getByRole('button', { name: '计数 0', exact: true }).click();
  for (let index = 0; index < 3; index++) {
    await a.getByRole('button', { name: '启动', exact: true }).click();
    await a.getByRole('status').filter({ hasText: '已就绪' }).waitFor();
    await a.getByRole('button', { name: '计数 0', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await a.getByRole('button', { name: '计数 1', exact: true }).count(), 1);
    await a.getByRole('button', { name: '停止', exact: true }).click();
    await a.getByRole('status').filter({ hasText: '已停止' }).waitFor();
  }
  await page.setViewportSize({ width: 640, height: 480 });
  await page.screenshot({ path: resolve(out, 'narrow.png') });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await b.getByRole('button', { name: '停止', exact: true }).click();
  await b.getByRole('status').filter({ hasText: '已停止' }).waitFor();
  assert.deepEqual(errors, []);
  writeFileSync(resolve(out, 'result.json'), JSON.stringify({ realBrowser: true, browser: browser.version(),
    address, viewports: ['1280x800', '640x480'], checks: ['能力预检零激活', 'Vue 失败清理', '部分挂载回收', '双实例隔离', '重复启停', '键盘操作', '窄屏无横向溢出', '初始化失败超时后仍能观察收尾', 'Vue 卸载失败禁止复用'], pageErrors: errors }, null, 2));
  console.log('真实 Chrome 宿主、失败回收、隔离、重复启停及键盘验证通过');
} finally { await browser?.close(); await server.close(); }

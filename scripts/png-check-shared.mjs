import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { startPngStatic } from './png-static.mjs';
async function bounded(promise, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`等待超时：${label}`)), 8000); })]); }
  finally { clearTimeout(timer); }
}

async function nativeResourceTracking(context) {
  await context.addInitScript(() => {
    const urls = new Set(); const workers = new Set();
    const create = URL.createObjectURL.bind(URL); const revoke = URL.revokeObjectURL.bind(URL); const NativeWorker = Worker;
    URL.createObjectURL = blob => { const url = create(blob); urls.add(url); return url; };
    URL.revokeObjectURL = url => { revoke(url); urls.delete(url); };
    window.Worker = class extends NativeWorker {
      constructor(...args) { super(...args); workers.add(this); }
      terminate() { super.terminate(); workers.delete(this); }
    };
    // 只由验收上下文注入，生产应用不包含测试后门或资源登记表。
    window.pngNativeResources = () => ({ urls: urls.size, workers: workers.size });
  });
}
async function holdWorker(page) {
  const entered = Promise.withResolvers(); const release = Promise.withResolvers(); const ended = Promise.withResolvers();
  let started = false;
  const handler = async route => { started = true; entered.resolve(); await release.promise; try { await route.continue(); } catch { /* 已终止线程的请求允许被浏览器取消。 */ } finally { ended.resolve(); } };
  await page.route('**/raster-worker.js', handler);
  return { entered: entered.promise, async finish() { release.resolve(); if (started) await bounded(ended.promise, '释放线程请求'); await page.unroute('**/raster-worker.js', handler); } };
}
export async function checkPngBrowser(directory, screenshots) {
  if (screenshots) mkdirSync(screenshots, { recursive: true });
  const staticHost = await startPngStatic(directory);
  let browser; let context; let page; let barrier;
  const errors = []; const unexpected = []; const paths = new Set(); const modulePath = `${staticHost.prefix}app.js`;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    context = await browser.newContext({ viewport: { width: 1280, height: 850 }, acceptDownloads: true });
    await nativeResourceTracking(context); page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === staticHost.origin && [staticHost.prefix, ...['app.js', 'app.css', 'raster-worker.js'].map(name => staticHost.prefix + name)].includes(url.pathname)) {
        paths.add(url.pathname); return route.continue();
      }
      unexpected.push(url.pathname); return route.abort();
    });
    await page.goto(staticHost.address); await page.getByRole('heading', { name: 'PNG 缩放器' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '开始缩放' }).isDisabled(), true);
    if (screenshots) await page.screenshot({ path: resolve(screenshots, 'empty.png') });
    const bytes = await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(320, 180); const drawing = canvas.getContext('2d');
      drawing.fillStyle = '#2866a6'; drawing.fillRect(0, 0, 160, 180); drawing.fillStyle = '#8bc5af'; drawing.fillRect(32, 32, 96, 116);
      return [...new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())];
    });
    const upload = { name: '透明测试.png', mimeType: 'image/png', buffer: Buffer.from(bytes) };
    await page.getByLabel('导入 PNG', { exact: true }).setInputFiles(upload);
    await page.getByRole('status').filter({ hasText: '原图已读取' }).waitFor();
    await page.getByLabel('目标宽度 / px', { exact: true }).fill('160');
    await page.getByRole('button', { name: '开始缩放' }).focus(); await page.keyboard.press('Enter');
    await page.getByRole('status').filter({ hasText: '缩放完成' }).waitFor();
    await page.getByRole('button', { name: '开始缩放' }).hover();
    if (screenshots) await page.screenshot({ path: resolve(screenshots, 'complete-hover.png') });
    const downloading = page.waitForEvent('download'); await page.getByRole('link', { name: '下载 PNG' }).click(); const download = await downloading;
    assert.equal(download.suggestedFilename(), '透明测试-160x90.png');
    const downloaded = resolve(mkdtempSync(resolve(tmpdir(), 'cordis-w5-output-')), download.suggestedFilename()); await download.saveAs(downloaded);
    const png = readFileSync(downloaded); assert.equal(png.readUInt32BE(16), 160); assert.equal(png.readUInt32BE(20), 90);
    const pixels = await page.evaluate(async array => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(array)], { type: 'image/png' }));
      try { const canvas = new OffscreenCanvas(bitmap.width, bitmap.height); const drawing = canvas.getContext('2d'); drawing.drawImage(bitmap, 0, 0);
        return { width: bitmap.width, height: bitmap.height, opaque: [...drawing.getImageData(0, 0, 1, 1).data], transparent: [...drawing.getImageData(bitmap.width - 1, 0, 1, 1).data] };
      } finally { bitmap.close(); }
    }, [...png]);
    assert.deepEqual(pixels.opaque, [40, 102, 166, 255]); assert.equal(pixels.transparent[3], 0);
    const priorResult = await page.evaluate(async path => (await import(path)).tool.session.inspect().result.url, modulePath);
    await page.getByLabel('目标宽度 / px', { exact: true }).fill('0');
    assert.equal(await page.getByRole('button', { name: '开始缩放' }).isDisabled(), true);
    await page.getByLabel('目标宽度 / px', { exact: true }).fill('160');
    barrier = await holdWorker(page); await page.getByRole('button', { name: '开始缩放' }).click(); await bounded(barrier.entered, '线程资源请求');
    if (screenshots) await page.screenshot({ path: resolve(screenshots, 'processing.png') });
    await page.getByRole('button', { name: '取消', exact: true }).click(); await page.getByRole('status').filter({ hasText: '已取消' }).waitFor();
    assert.equal(await page.evaluate(async path => (await import(path)).tool.session.inspect().result.url, modulePath), priorResult);
    assert.deepEqual(await page.evaluate(() => window.pngNativeResources()), { urls: 2, workers: 0 }); await barrier.finish(); barrier = undefined;
    await page.getByLabel('导入 PNG', { exact: true }).setInputFiles({ name: '假图片.png', mimeType: 'image/png', buffer: Buffer.from('not png') });
    await page.getByRole('status').filter({ hasText: '文件不是有效' }).waitFor();
    assert.equal(await page.evaluate(async path => (await import(path)).tool.session.inspect().result.url, modulePath), priorResult);
    if (screenshots) await page.screenshot({ path: resolve(screenshots, 'invalid-preserved.png') });
    for (const offset of [1, 0]) {
      const corruptWorker = route => route.fulfill({ contentType: 'text/javascript; charset=utf-8', body:
        `self.onmessage = event => self.postMessage({protocol:1,id:event.data.id+${offset},ok:true,width:160,height:90,blob:new Blob(["bad"],{type:"image/png"})});` });
      await page.route('**/raster-worker.js', corruptWorker);
      await page.getByRole('button', { name: '开始缩放' }).click(); await page.getByRole('status').filter({ hasText: '图片处理失败' }).waitFor();
      assert.equal(await page.evaluate(async path => (await import(path)).tool.session.inspect().result.url, modulePath), priorResult);
      assert.deepEqual(await page.evaluate(() => window.pngNativeResources()), { urls: 2, workers: 0 });
      await page.unroute('**/raster-worker.js', corruptWorker);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByLabel('目标宽度 / px', { exact: true }).focus();
    if (screenshots) await page.screenshot({ path: resolve(screenshots, 'narrow-focus.png'), fullPage: true });
    barrier = await holdWorker(page); await page.getByRole('button', { name: '开始缩放' }).click(); await bounded(barrier.entered, '线程资源请求');
    const stopped = await page.evaluate(async path => {
      const { tool } = await import(path); const result = await tool.host.stop();
      return { state: result.state, empty: document.querySelector('#app').childNodes.length === 0,
        session: tool.session.inspectResources(), raster: tool.raster.inspectResources(), ui: tool.ui.inspect(), commands: tool.commands.inspect() };
    }, modulePath);
    assert.equal(stopped.state, 'stopped'); assert.equal(stopped.empty, true);
    for (const field of ['tasks', 'urls', 'listeners']) assert.equal(stopped.session[field], 0);
    assert.equal(stopped.raster.workers, 0); assert.equal(stopped.commands.running, 0); assert.equal(stopped.commands.commands, 0);
    assert.equal(stopped.ui.contributions, 0); assert.equal(stopped.ui.observers, 0);
    assert.deepEqual(await page.evaluate(() => window.pngNativeResources()), { urls: 0, workers: 0 }); await barrier.finish(); barrier = undefined;
    const isolated = await page.evaluate(async ({ path, bytes }) => {
      const { startImageTool } = await import(path); const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      const targets = [document.createElement('div'), document.createElement('div')]; targets.forEach(target => { target.hidden = true; document.body.append(target); });
      const apps = [];
      try {
        for (let round = 0; round < 3; round++) {
          const app = await startImageTool({ target: targets[0], onError() { throw new Error('重复挂载故障'); } });
          await app.session.importFile(blob, '重复.png'); await app.host.stop(); if (targets[0].childNodes.length) return false;
        }
        for (const target of targets) apps.push(await startImageTool({ target, onError() { throw new Error('双实例故障'); } }));
        await Promise.all(apps.map((app, i) => app.session.importFile(blob, `实例${i}.png`)));
        apps[0].session.setWidth('80'); apps[1].session.setWidth('160'); await apps[0].commands.execute('image.resize', {});
        if (apps[1].session.inspect().result) return false; await apps[0].host.stop();
        await apps[1].commands.execute('image.resize', {});
        return apps[1].session.inspect().result.width === 160 && apps[1].host.inspect().state === 'ready';
      } finally { await Promise.all(apps.map(app => app.host.stop())); targets.forEach(target => target.remove()); }
    }, { path: modulePath, bytes });
    assert.equal(isolated, true); assert.deepEqual(await page.evaluate(() => window.pngNativeResources()), { urls: 0, workers: 0 });
    // 在隔离页面模拟真实环境缺少 Worker；不向生产业务增加故障开关。
    const unavailable = await context.newPage();
    try {
      await unavailable.addInitScript(() => { window.Worker = class { constructor() { throw new Error('disabled'); } }; });
      await unavailable.goto(staticHost.address); await unavailable.getByLabel('导入 PNG', { exact: true }).setInputFiles(upload);
      await unavailable.getByRole('status').filter({ hasText: '当前浏览器不能使用' }).waitFor();
      assert.equal(await unavailable.getByRole('link', { name: '下载 PNG' }).count(), 0);
      await unavailable.evaluate(async path => { await (await import(path)).tool.host.stop(); }, modulePath);
    } finally { await unavailable.close(); }
    assert.ok(paths.has(`${staticHost.prefix}raster-worker.js`)); assert.equal(unexpected.length, 0); assert.deepEqual(errors, []);
    assert.equal((await fetch(`${staticHost.origin}/api/records`)).status, 404);
    return { realBrowser: true, chrome: browser.version(), staticSubpath: staticHost.prefix, noBackendApi: true, connectBlockedByCsp: true,
      actualDownload: true, decodedPng: pixels, cancelledPreservesResult: true, invalidPreservesInput: true, stopDuringTask: true,
      nativeResourcesReleased: true, repeatedMounts: 3, isolatedInstances: true, unsupportedExplicit: true, invalidWorkerReplyRejected: true, invalidWorkerBinaryRejected: true, download: downloaded };
  } catch (error) {
    if (screenshots && page && !page.isClosed()) await page.screenshot({ path: resolve(screenshots, 'failure.png'), fullPage: true });
    throw new Error(`W5 浏览器验收失败；页面异常：${JSON.stringify(errors)}`, { cause: error });
  } finally { try { await barrier?.finish(); } finally { await Promise.all([context?.close(), browser?.close(), staticHost.server.close()]); } }
}

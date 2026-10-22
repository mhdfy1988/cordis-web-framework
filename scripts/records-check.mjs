import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { DatabaseSync } from 'node:sqlite';
import { root, runNode } from './run.mjs';
import { buildRecords, vueDefines } from './records-build.mjs';
import { build } from 'esbuild';

runNode(['scripts/build.mjs']);
const out = await buildRecords();
// 动态导入确保运行的是本次构建的公开包，不在构建前缓存旧适配。
const { startRecordsApplication } = await import('../examples/records/server/application.ts');
const { readRecordAssets } = await import('../examples/records/server/assets.ts');
const { createLogger } = await import('../dist/logging-consola/index.js');
const { createJsonClient } = await import('../dist/http-json/index.js');
const { sessionOperation, listOperation, saveOperation } = await import('../examples/records/shared/protocol.ts');
const directory = mkdtempSync(resolve(tmpdir(), 'cordis-w3-browser-'));
const databaseFile = resolve(directory, 'records.sqlite');
const reportDir = resolve(root, 'output/records-check'); mkdirSync(reportDir, { recursive: true });
const events = [];
let behavior = 'normal';
let gate;
async function bounded(promise, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`验收等待超时：${label}`)), 5000); })]); }
  finally { clearTimeout(timer); }
}
function barrier() { return { entered: Promise.withResolvers(), release: Promise.withResolvers(), aborted: Promise.withResolvers() }; }
async function hold(context) {
  const owned = gate;
  context.signal.addEventListener('abort', () => owned.aborted.resolve(), { once: true });
  owned.entered.resolve(); await owned.release.promise;
}
const host = await startRecordsApplication({ localDemo: true, databaseFile,
  assets: [...readRecordAssets(out), { path: '/lifecycle.js', contentType: 'text/javascript; charset=utf-8', content:
    (await build({ absWorkingDir: root, entryPoints: ['examples/records/browser/application.ts'], bundle: true,
      platform: 'browser', format: 'esm', target: 'es2022', write: false, define: vueDefines })).outputFiles[0].text }],
  logger: createLogger({ write: event => { events.push(event); } }), hooks: {
    async beforeSave(context) { if (behavior === 'fail') throw new Error('private-storage-error'); if (behavior === 'before') await hold(context); },
    async afterCommit(context) { if (behavior === 'after') await hold(context); },
  } });
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(host.address);
  await page.getByRole('button', { name: '编辑者', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已读取' }).waitFor();
  await page.getByRole('button', { name: /第一条记录/ }).click();
  await page.getByLabel('标题', { exact: true }).fill('浏览器保存的中文记录');
  await page.getByLabel('内容', { exact: true }).fill('通过真实 HTTP 保存，再刷新回读。');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  const readback = new DatabaseSync(databaseFile, { readOnly: true });
  try { assert.equal(readback.prepare('SELECT title FROM records WHERE id = ?').get('welcome').title, '浏览器保存的中文记录'); }
  finally { readback.close(); }
  await page.reload();
  await page.getByRole('button', { name: '编辑者', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已读取' }).waitFor();
  await page.getByRole('button', { name: /浏览器保存的中文记录/ }).click();
  assert.equal(await page.getByLabel('标题', { exact: true }).inputValue(), '浏览器保存的中文记录');
  await page.screenshot({ path: resolve(reportDir, 'desktop.png') });

  await page.getByLabel('标题', { exact: true }).fill('协议拒绝后的草稿');
  await page.route('**/api/record', async route => route.continue({ headers: { ...route.request().headers(), 'x-framework-api': '2' } }));
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '前后端协议不兼容' }).waitFor();
  assert.equal(await page.getByLabel('标题', { exact: true }).inputValue(), '协议拒绝后的草稿');
  await page.unroute('**/api/record');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();

  let token;
  const otherClient = createJsonClient({ baseUrl: host.address, credential: () => token });
  token = (await otherClient.request(sessionOperation, { mode: 'editor' })).data.token;
  const otherRecord = (await otherClient.request(listOperation, {})).data.records.find(record => record.id === 'welcome');
  await otherClient.request(saveOperation, { id: otherRecord.id, revision: otherRecord.revision, title: '其他会话的新版本', body: '并发写入' });
  await page.getByLabel('标题', { exact: true }).fill('冲突后保留的草稿');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '修订冲突' }).waitFor();
  assert.equal(await page.getByLabel('标题', { exact: true }).inputValue(), '冲突后保留的草稿');
  await page.getByRole('button', { name: '核对服务器', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '草稿已保留' }).waitFor();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();

  behavior = 'fail';
  await page.getByLabel('标题', { exact: true }).fill('故障后保留的草稿');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '服务器处理失败' }).waitFor();
  assert.equal(await page.getByLabel('标题', { exact: true }).inputValue(), '故障后保留的草稿');
  await page.screenshot({ path: resolve(reportDir, 'failure.png') });
  behavior = 'normal';
  await page.getByRole('button', { name: '核对服务器', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '草稿已保留' }).waitFor();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();

  for (const phase of ['before', 'after']) {
    behavior = phase; gate = barrier();
    await page.getByLabel('标题', { exact: true }).fill(`取消${phase === 'before' ? '前' : '后'}的草稿`);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await bounded(gate.entered.promise, '进入保存处理器');
    await page.getByRole('button', { name: '停止等待', exact: true }).click();
    await bounded(gate.aborted.promise, '服务端观察取消');
    await page.getByRole('status').filter({ hasText: '保存结果未确认' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '保存', exact: true }).isDisabled(), true);
    gate.release.resolve(); behavior = 'normal';
    await page.getByRole('button', { name: '核对服务器', exact: true }).click();
    await page.getByRole('status').filter({ hasText: phase === 'before' ? '草稿已保留' : '服务器已保存' }).waitFor();
    assert.equal(await page.getByLabel('标题', { exact: true }).inputValue(), `取消${phase === 'before' ? '前' : '后'}的草稿`);
    if (phase === 'before') {
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
    }
  }

  await page.getByRole('button', { name: '只读者', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '只读身份' }).waitFor();
  assert.equal(await page.getByLabel('标题', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '保存', exact: true }).isDisabled(), true);
  await page.setViewportSize({ width: 640, height: 720 });
  await page.screenshot({ path: resolve(reportDir, 'narrow-readonly.png') });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: '编辑者', exact: true }).focus(); await page.keyboard.press('Enter');
  await page.getByRole('status').filter({ hasText: '已读取' }).waitFor();
  assert.deepEqual(pageErrors, []);
  const lifecycle = await page.evaluate(async () => {
    const { startRecordsBrowser } = await import('/lifecycle.js');
    const targets = [document.createElement('div'), document.createElement('div')];
    for (const target of targets) { target.hidden = true; document.body.append(target); }
    const hosts = await Promise.all(targets.map(target => startRecordsBrowser({ target, baseUrl: location.origin, onError() { throw new Error('呈现失败'); } })));
    const ids = targets.flatMap(target => Array.from(target.querySelectorAll('input,textarea')).map(element => element.id));
    const unique = new Set(ids).size === ids.length;
    const reports = await Promise.all(hosts.map(host => host.stop()));
    const empty = targets.every(target => target.childNodes.length === 0);
    for (const target of targets) target.remove();
    return unique && empty && reports.every(report => report.state === 'stopped' && report.runtime.plugins.every(plugin => plugin.state === 'stopped'));
  });
  assert.equal(lifecycle, true);
  assert.ok(events.some(event => event.message === 'records.committed' && event.fields.requestId));
  assert.ok(!JSON.stringify(events).includes('private-storage-error'));
  const js = readFileSync(resolve(out, 'app.js'), 'utf8');
  assert.ok(!js.includes('node:sqlite') && !js.includes('private-storage-error') && !js.includes('randomBytes'));
  writeFileSync(resolve(reportDir, 'result.json'), JSON.stringify({ chrome: browser.version(), databaseFile, address: host.address,
    realBrowser: true, viewports: ['1280x850', '640x720'], checks: ['真实保存和数据库回读', '刷新回读', '协议不兼容保留草稿', '修订冲突与核对', '故障保留草稿', '故障恢复',
      '提交前取消未写入', '提交后取消不回滚', '取消后核对', '只读权限', '键盘操作', '窄屏无横向溢出', '浏览器实例停止清理与表单标识隔离'], pageErrors,
    committed: events.filter(event => event.message === 'records.committed').map(event => ({ requestId: event.fields.requestId, revision: event.fields.revision })) }, null, 2));
  console.log('W3 Chrome：保存、刷新回读、故障恢复、两种取消、只读和键盘路径通过');
} finally { gate?.release.resolve(); await browser?.close(); await host.stop(); }

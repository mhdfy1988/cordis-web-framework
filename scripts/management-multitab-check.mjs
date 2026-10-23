import assert from 'node:assert/strict';
import { build } from 'esbuild';

/** 在已有隔离服务和 Chrome 上下文中运行；不访问用户的常驻入口和正式配置。 */
export async function sharedManagementFixture(root) {
  const result = await build({ absWorkingDir: root, entryPoints: ['tests/management-multitab-browser.ts'],
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false });
  return result.outputFiles[0].text;
}
export async function checkSharedManagement(context, address) {
  const library = 'shared-' + crypto.randomUUID();
  const url = `${address}/shared?library=${library}`;
  const first = await context.newPage(); const second = await context.newPage();
  const errors = [];
  for (const page of [first, second]) page.on('pageerror', error => errors.push(error.message));
  const ready = page => page.locator('html[data-shared="ready"]').waitFor();
  const snapshot = page => page.evaluate(() => window.sharedHarness.snapshot());
  const wait = (page, label, enabled) => page.waitForFunction(({ label, enabled }) => {
    const state = window.sharedHarness.snapshot();
    return state.applied === label && state.plugins[0].enabled === enabled;
  }, { label, enabled });
  try {
    await Promise.all([first.goto(url), second.goto(url)]); await Promise.all([ready(first), ready(second)]);
    assert.equal((await snapshot(first)).revision, (await snapshot(second)).revision, '同时首次打开只初始化一次');
    await first.evaluate(() => window.sharedHarness.disable()); await wait(second, '', false);
    await second.evaluate(() => window.sharedHarness.enable()); await wait(first, 'initial', true);
    const before = await snapshot(first);
    await first.evaluate(revision => window.sharedHarness.configure('changed', revision), before.revision);
    await wait(second, 'changed', true);
    assert.ok((await snapshot(second)).releases > 0, '远端配置改变实际重建插件');
    const stale = await second.evaluate(async revision => {
      try { await window.sharedHarness.configure('stale-draft', revision); return ''; } catch (error) { return error.message; }
    }, before.revision);
    assert.match(stale, /修订冲突/);
    assert.equal((await snapshot(second)).config.label, 'changed');
    const rejectedWrite = await second.evaluate(async () => {
      try { await window.sharedHarness.staleWrite(0); return ''; } catch (error) { return error.message; }
    });
    assert.match(rejectedWrite, /修订冲突/);
    await second.reload(); await ready(second); await wait(second, 'changed', true);
    const revision = (await snapshot(first)).revision;
    const concurrent = await Promise.all([first, second].map((page, index) => page.evaluate(async ({ revision, index }) => {
      try { await window.sharedHarness.configure('writer-' + index, revision); return 'saved'; }
      catch (error) { return error.message; }
    }, { revision, index })));
    assert.equal(concurrent.filter(value => value === 'saved').length, 1, '两个旧修订提交只允许一个成功');
    assert.match(concurrent.find(value => value !== 'saved'), /修订冲突|其他页面修改/);
    await Promise.all([first, second].map(page => page.evaluate(() => window.sharedHarness.refresh())));
    assert.deepEqual((await snapshot(first)).config, (await snapshot(second)).config);
    await first.evaluate(() => window.sharedHarness.install());
    await second.waitForFunction(() => window.sharedHarness.snapshot().plugins.some(item => item.id === 'dynamic'));
    await second.evaluate(() => window.sharedHarness.enableDynamic());
    await first.waitForFunction(() => window.sharedHarness.snapshot().plugins.find(item => item.id === 'dynamic')?.state === 'ready');
    await first.evaluate(() => window.sharedHarness.uninstallDynamic());
    await second.waitForFunction(() => !window.sharedHarness.snapshot().plugins.some(item => item.id === 'dynamic'));
    const failure = await first.evaluate(async () => {
      try { await window.sharedHarness.configure('activation-fault', window.sharedHarness.snapshot().revision); return ''; }
      catch (error) { return error.message; }
    });
    assert.match(failure, /failed/);
    await second.waitForFunction(() => window.sharedHarness.snapshot().plugins[0].state === 'failed');
    assert.equal((await snapshot(second)).ready, false);
    // 激活失败不应把管理器永久锁死，另一页面仍能停用并恢复。
    await second.evaluate(() => window.sharedHarness.disable()); await wait(first, '', false);
    await first.evaluate(() => window.sharedHarness.configure('recovered', window.sharedHarness.snapshot().revision));
    await wait(second, 'recovered', true);
    assert.equal((await snapshot(second)).ready, true);
    await first.evaluate(() => window.sharedHarness.close());
    await second.evaluate(() => window.sharedHarness.disable()); await second.reload(); await ready(second);
    await wait(second, '', false);
    assert.deepEqual(errors, []);
    await second.evaluate(() => window.sharedHarness.close());
    return ['multi-tab concurrent initialization', 'cross-tab intent and config reconciliation', 'stale form and CAS rejection',
      'concurrent writers', 'cross-tab install/uninstall', 'remote activation failure and recovery', 'refresh persistence', 'independent page close'];
  } finally { await first.close(); await second.close(); }
}

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** 源码构建与工程外 tarball 复用同一真实浏览器验收，避免消费检查缩水成 import。 */
export async function checkUiWorkspace(browser, address, databaseFile, screenshotDirectory) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  try {
    await page.goto(address); await page.getByRole('button', { name: '编辑者', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '已读取' }).waitFor();
    const initial = await page.evaluate(async () => (await import('/app.js')).workspace.ui.inspect());
    await page.getByLabel('标题', { exact: true }).fill('界面插件跨布局草稿');
    await page.getByLabel('内容', { exact: true }).fill('同一业务会话，不由布局持有。');
    await page.locator('summary').click();
    await page.getByRole('radio', { name: '顶栏', exact: true }).check();
    await page.locator('[data-layout="topbar"]').waitFor();
    assert.equal(await page.getByLabel('标题', { exact: true }).inputValue(), '界面插件跨布局草稿');
    await page.getByLabel('标题', { exact: true }).focus(); await page.keyboard.press('Control+s');
    await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
    const db = new DatabaseSync(databaseFile, { readOnly: true });
    try { assert.equal(db.prepare('SELECT title FROM records WHERE id=?').get('second').title, '界面插件跨布局草稿'); } finally { db.close(); }
    await page.getByLabel('内容', { exact: true }).fill('页面切换仍保留的未保存内容');
    await page.getByRole('link', { name: '帮助', exact: true }).click(); await page.getByRole('heading', { name: '工作区帮助' }).waitFor();
    assert.ok(page.url().endsWith('#/help'));
    await page.goBack(); await page.getByLabel('内容', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('内容', { exact: true }).inputValue(), '页面切换仍保留的未保存内容');
    await page.getByRole('checkbox', { name: '深色主题' }).check();
    await page.waitForFunction(() => document.querySelector('#workspace').style.getPropertyValue('--cw-surface') === '#202a36');
    if (screenshotDirectory) await page.screenshot({ path: resolve(screenshotDirectory, 'topbar-dark.png') });
    await page.getByRole('checkbox', { name: '深色主题' }).uncheck();
    for (let round = 0; round < 3; round++) {
      for (const [label, layout] of [['侧栏', 'sidebar'], ['顶栏', 'topbar']]) {
        await page.getByRole('radio', { name: label, exact: true }).check(); await page.locator(`[data-layout="${layout}"]`).waitFor();
        assert.equal(await page.getByLabel('内容', { exact: true }).inputValue(), '页面切换仍保留的未保存内容');
      }
    }
    const later = await page.evaluate(async () => (await import('/app.js')).workspace.ui.inspect());
    for (const field of ['contributions', 'waiters', 'observers']) assert.equal(later[field], initial[field], `重复布局切换不累积 ${field}`);
    await page.getByRole('link', { name: '帮助', exact: true }).click();
    await page.getByRole('checkbox', { name: '帮助扩展' }).uncheck();
    await page.getByRole('status').filter({ hasText: '页面不存在或扩展已停用' }).waitFor();
    assert.equal(await page.getByRole('link', { name: '帮助', exact: true }).count(), 0);
    assert.equal(await page.evaluate(async () => (await import('/app.js')).workspace.commands.execute('workspace.help', {})), 'missing');
    assert.equal(await page.evaluate(async () => (await import('/app.js')).workspace.host.inspect().state), 'ready', '主动停用可选扩展不应使必需业务失去就绪');
    if (screenshotDirectory) await page.screenshot({ path: resolve(screenshotDirectory, 'removed-current-route.png') });
    await page.getByRole('checkbox', { name: '帮助扩展' }).check(); await page.getByRole('heading', { name: '工作区帮助' }).waitFor();
    await page.reload(); await page.getByRole('heading', { name: '工作区帮助' }).waitFor();
    await page.getByRole('link', { name: '记录', exact: true }).click(); await page.getByRole('button', { name: '编辑者', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '已读取' }).waitFor();
    assert.equal(await page.getByLabel('标题', { exact: true }).inputValue(), '界面插件跨布局草稿');
    if (screenshotDirectory) await page.screenshot({ path: resolve(screenshotDirectory, 'sidebar-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '窄屏不得产生整页横向滚动');
    await page.getByRole('button', { name: '保存', exact: true }).focus();
    if (screenshotDirectory) await page.screenshot({ path: resolve(screenshotDirectory, 'narrow-focus.png'), fullPage: true });
    await page.locator('summary').click(); await page.getByRole('button', { name: '停止工作区', exact: true }).click();
    await page.locator('#check-status').filter({ hasText: '已停止' }).waitFor();
    const stopped = await page.evaluate(async () => {
      const app = (await import('/app.js')).workspace;
      const target = document.querySelector('#workspace'); const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true, bubbles: true });
      target.dispatchEvent(event);
      return { ui: app.ui.inspect(), navigation: app.navigation.inspect(), commands: app.commands.inspect(),
        empty: target.childNodes.length === 0, themeEmpty: !target.style.getPropertyValue('--cw-accent'), shortcutDetached: !event.defaultPrevented, state: app.host.inspect().state };
    });
    assert.equal(stopped.state, 'stopped'); assert.equal(stopped.empty && stopped.themeEmpty && stopped.shortcutDetached, true);
    for (const name of ['contributions', 'waiters', 'observers']) assert.equal(stopped.ui[name], 0);
    for (const name of ['routes', 'navigation', 'listeners']) assert.equal(stopped.navigation[name], 0);
    assert.equal(stopped.commands.commands, 0); assert.equal(stopped.commands.running, 0);
    const contracts = await page.evaluate(async () => (await import('/contracts.js')).runUiBrowserContracts());
    const instances = await page.evaluate(async () => {
      const { startUiWorkspace } = await import('/workspace.js');
      const targets = [document.createElement('div'), document.createElement('div')]; targets.forEach(target => { target.hidden = true; document.body.append(target); });
      const apps = [];
      try {
        for (const target of targets) apps.push(await startUiWorkspace({ target, baseUrl: location.origin, history: 'memory', onError() { throw new Error('实例呈现异常'); } }));
        await Promise.all(apps.map(app => app.editor.identify('editor')));
        apps[0].editor.edit('title', '实例 A 草稿'); apps[1].editor.edit('title', '实例 B 草稿');
        await apps[0].changeLayout('topbar'); apps[0].changeTheme(true);
        if (apps[1].editor.inspect().draft.title !== '实例 B 草稿' || targets[1].querySelector('[data-layout="topbar"]') || targets[1].style.getPropertyValue('--cw-surface') !== '#ffffff') return false;
        await apps[0].host.stop();
        if (targets[0].childNodes.length || apps[1].host.inspect().state !== 'ready') return false;
        await apps[1].commands.execute('records.save', { sessionId: 'record-editor' });
        return apps[1].editor.inspect().status === '已保存';
      } finally { await Promise.all(apps.map(app => app.host.stop())); targets.forEach(target => target.remove()); }
    });
    assert.equal(instances, true); assert.deepEqual(pageErrors, []);
    return { realBrowser: true, chrome: browser.version(), layoutReplacement: true, draftPreserved: true, keyboardSaveAndDatabaseReadback: true,
      repeatedReplacementNoGrowth: true, hashHistoryAndRefresh: true, revokeCurrentRoute: true, stoppedClean: true, isolatedInstances: true, contracts };
  } catch (error) {
    if (screenshotDirectory) await page.screenshot({ path: resolve(screenshotDirectory, 'failure.png'), fullPage: true });
    throw new Error(`界面验收失败；页面异常：${JSON.stringify(pageErrors)}`, { cause: error });
  } finally { await page.close(); }
}

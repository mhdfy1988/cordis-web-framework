import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { startApplication } from './application.mjs';
const { chromium } = await import(process.argv[2]);
const host = await startApplication(); let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true }); const page = await browser.newPage();
  await page.goto(host.address); await page.getByRole('button', { name: '编辑者', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已读取' }).waitFor();
  await page.getByLabel('标题', { exact: true }).fill('交付模板实际保存');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  const database = new DatabaseSync('data/records.sqlite', { readOnly: true });
  try { assert.equal(database.prepare('SELECT title FROM records WHERE id = ?').get('second').title, '交付模板实际保存'); }
  finally { database.close(); }
} finally { await browser?.close(); assert.equal((await host.stop()).state, 'stopped'); }

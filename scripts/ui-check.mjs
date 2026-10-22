import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { root, runNode } from './run.mjs';
import { uiWorkspaceAssets } from './ui-workspace-build.mjs';
import { checkUiWorkspace } from './ui-check-shared.mjs';

runNode(['scripts/build.mjs']); const { assets } = await uiWorkspaceAssets();
const { startRecordsApplication } = await import('../examples/records/server/application.ts');
const databaseFile = resolve(mkdtempSync(resolve(tmpdir(), 'cordis-w4-ui-')), 'records.sqlite');
const report = resolve(root, 'output/ui-check'); mkdirSync(report, { recursive: true });
const host = await startRecordsApplication({ localDemo: true, databaseFile, assets }); let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const result = await checkUiWorkspace(browser, host.address, databaseFile, report);
  writeFileSync(resolve(report, 'result.json'), JSON.stringify({ ...result, address: host.address, databaseFile }, null, 2));
  console.log('W4 真实 Chrome 布局替换、公开契约、命令、导航、主题及撤销验收通过');
} finally { await browser?.close(); await host.stop(); }

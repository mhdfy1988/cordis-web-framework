import assert from 'node:assert/strict';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { runNpm, runNode } from './run.mjs';
import { uiWorkspaceAssets } from './ui-workspace-build.mjs';
import { checkUiWorkspace } from './ui-check-shared.mjs';
const require = createRequire(import.meta.url);

export async function checkUiConsumer(consumer) {
  runNpm(['install', '--save-exact', 'vue-router@4.6.4', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: consumer });
  copyFileSync(resolve(consumer, 'ui-types.fixture'), resolve(consumer, 'types-ui.mts'));
  runNode([require.resolve('typescript/bin/tsc'), '-p', resolve(consumer, 'tsconfig.json')], { cwd: consumer });
  const { assets, inputs } = await uiWorkspaceAssets(consumer, 'ui-workspace', 'ui-browser-fixture.ts');
  assert.ok(inputs.some(path => path.includes('node_modules/cordis-web-framework/dist/ui-registry/')));
  assert.ok(!inputs.some(path => /(^|[\\/])src[\\/]|fluid-block/.test(path)), '工程外界面只能消费产物，不读开发源码');
  const { startRecordsApplication } = await import(pathToFileURL(resolve(consumer, 'records/server/application.ts')).href);
  const databaseFile = resolve(consumer, 'ui-consumer.sqlite');
  const host = await startRecordsApplication({ localDemo: true, databaseFile, assets }); let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    return { ...(await checkUiWorkspace(browser, host.address, databaseFile)), frameworkFromTarball: true, optionalRouterExplicit: true, strictUiNodeNext: true };
  } finally { await browser?.close(); await host.stop(); }
}

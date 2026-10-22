import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import ts from 'typescript';
import { parseHTML } from 'linkedom';
import { chromium } from 'playwright';
import { serveDocumentation } from '../build/static-server.ts';
import { verifyBuild, digest } from '../build/integrity.ts';

const report = JSON.parse(readFileSync('output/full-site-build.json', 'utf8'));
verifyBuild(report);
mkdirSync('output', { recursive: true });
const directory = mkdtempSync(resolve('output/documented-examples-'));
const snippets: { file: string; name: string; input: string }[] = [];
for (const file of ['reference/core.md', 'reference/foundation.md', 'reference/hosts-http.md']) {
  const markdown = readFileSync(resolve('content/editions', file), 'utf8');
  for (const match of markdown.matchAll(/```ts\n([\s\S]*?)```/g)) {
    const name = match[1].match(/export (?:async )?function (run\w+Example)\(/)?.[1];
    if (!name) continue;
    const input = resolve(directory, name + '.ts');
    writeFileSync(input, match[1]);
    snippets.push({ file, name, input });
  }
}
assert.equal(snippets.length, 4, '四个自包含 API 示例都必须纳入验证');
const program = ts.createProgram(snippets.map(item => item.input), {
  strict: true, skipLibCheck: true, noEmit: true,
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
});
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: () => process.cwd(), getCanonicalFileName: file => file, getNewLine: () => '\n',
}));
const results: Record<string, unknown> = {};
for (const snippet of snippets) {
  const output = resolve(directory, snippet.name + '.mjs');
  await build({ entryPoints: [snippet.input], outfile: output, platform: 'node', format: 'esm', target: 'node24', bundle: false });
  const module = await import(pathToFileURL(output).href);
  results[snippet.name] = await module[snippet.name]();
}
assert.deepEqual(results.runPluginExample, { answer: '你好，小林', ready: true, released: 1 });
assert.deepEqual(results.runConfigurationExample, { port: 5000 });
assert.deepEqual(results.runShutdownExample, { before: 'running', after: 'stopped' });
assert.deepEqual(results.runHttpExample, { data: { text: '你好，HTTP' }, hasRequestId: true });

const manifest = JSON.parse(readFileSync(resolve(report.outDir, 'manifest.json'), 'utf8')) as { pages: { route: string; file: string }[] };
for (const [route, file] of [['/guide/plugins', 'plugins.mjs'], ['/guide/communication', 'http.mjs'], ['/guide/ui', 'ui.mjs']]) {
  const entry = manifest.pages.find(page => page.route === route)!;
  const page = JSON.parse(readFileSync(resolve(report.outDir, entry.file), 'utf8'));
  const source = readFileSync(resolve('content/docs/examples', file), 'utf8').trim();
  const code = [...parseHTML(page.html).document.querySelectorAll('pre code')].map(element => element.textContent?.trim());
  assert.ok(code.includes(source), `正文必须展示完整同源代码：${route}`);
}
for (const file of ['plugins.mjs', 'http.mjs']) {
  const result = spawnSync(process.execPath, [resolve('content/docs/examples', file)], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  results[file] = result.stdout.trim();
}

const web = resolve(directory, 'web');
mkdirSync(web);
cpSync('content/docs/examples/ui.html', resolve(web, 'index.html'));
await build({ entryPoints: ['content/docs/examples/ui.mjs'], outfile: resolve(web, 'tutorial.js'), platform: 'browser', format: 'esm', bundle: true,
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' } });
const server = await serveDocumentation(web, '/example/');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(server.url);
  await page.getByRole('heading', { name: '教程工作台' }).waitFor();
  await page.getByRole('button', { name: '执行命令' }).click();
  await page.getByText('已执行 1 次', { exact: true }).waitFor();
  await page.getByRole('button', { name: '停止应用' }).click();
  await page.getByText('已停止', { exact: true }).waitFor();
  assert.equal(await page.locator('#app').innerHTML(), '');
  assert.deepEqual(errors, []);
  results['ui.mjs'] = { executed: 1, stopped: true, containerEmpty: true };
} finally { await browser.close(); await server.close(); }
writeFileSync('output/documented-examples-test.json', JSON.stringify({ build: digest('output/full-site-build.json'), testSource: digest('tests/doc-examples.test.ts'), snippets: snippets.map(({ file, name }) => ({ file, name })), results, complete: true }, null, 2));
console.log('文档示例：4 个 API 严格类型与执行、3 个同源教程和真实 HTTP／Vue 清理通过');

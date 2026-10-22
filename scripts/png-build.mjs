import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { root, runNode, runNpm } from './run.mjs';
const require = createRequire(import.meta.url);

export function frameworkDigest() {
  const hash = createHash('sha256');
  const visit = directory => { for (const file of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, file.name); if (file.isDirectory()) visit(path); else { hash.update(relative(root, path)); hash.update(readFileSync(path)); }
  } }; visit(resolve(root, 'src')); return hash.digest('hex');
}
export function checkPngInputs(inputs) {
  const paths = inputs.map(path => path.replaceAll('\\', '/'));
  const forbidden = /node:|(?:^|\/)(?:fastify|vue-router|records|ui-workspace)(?:\/|$)|cordis-web-framework\/(?:src|dist\/(?:hosts\/node|http-json))\//;
  assert.ok(!paths.some(path => forbidden.test(path)), '纯浏览器产物含服务器、旧业务、路由或框架源码');
  assert.ok(paths.some(path => path.includes('node_modules/cordis-web-framework/dist/')), '必须实际使用 tarball 公开产物');
}
export async function preparePngConsumer(tarball) {
  const consumer = mkdtempSync(resolve(tmpdir(), 'cordis-w5-png-'));
  const location = relative(root, consumer); assert.ok(isAbsolute(location) || location.startsWith(`..${sep}`));
  cpSync(resolve(root, 'tests/png-consumer'), consumer, { recursive: true });
  cpSync(resolve(root, 'examples/png-resizer'), resolve(consumer, 'app'), { recursive: true });
  runNpm(['install', tarball, 'vue@3.5.44', '--save-exact', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: consumer });
  for (const name of ['cordis', 'typescript', 'vue-router']) assert.equal(existsSync(resolve(consumer, 'node_modules', name)), false, `不应隐式安装 ${name}`);
  assert.equal(existsSync(resolve(consumer, 'node_modules/cordis-web-framework/src')), false);
  runNode([require.resolve('typescript/bin/tsc'), '-p', resolve(consumer, 'tsconfig.json')], { cwd: consumer });
  const out = resolve(consumer, 'web'); mkdirSync(out, { recursive: true }); const inputs = new Set();
  for (const [name, entry] of [['app', 'app/main.ts'], ['raster-worker', 'app/raster-worker.ts']]) {
    const result = await build({ absWorkingDir: consumer, entryPoints: [entry], bundle: true, platform: 'browser', format: 'esm',
      target: 'es2022', outfile: resolve(out, `${name}.js`), metafile: true,
      define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false', 'process.env.NODE_ENV': '"production"' } });
    for (const input of Object.keys(result.metafile.inputs)) inputs.add(input);
    assert.ok(!Object.values(result.metafile.outputs).some(file => file.imports.some(item => item.external)), '浏览器产物有未解析依赖');
  }
  checkPngInputs([...inputs]);
  cpSync(resolve(consumer, 'app/index.html'), resolve(out, 'index.html'));
  writeFileSync(resolve(out, 'inputs.json'), JSON.stringify([...inputs], null, 2));
  const hashes = Object.fromEntries(['index.html', 'app.js', 'app.css', 'raster-worker.js'].map(file => [file, createHash('sha256').update(readFileSync(resolve(out, file))).digest('hex')]));
  return { consumer, out, inputs: [...inputs], hashes,
    tarballIntegrity: `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}` };
}

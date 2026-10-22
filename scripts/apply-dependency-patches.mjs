import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertCordisPatchTarget } from './dependency-patch-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const manifest = readJson(resolve(root, 'package.json'));
const cordis = readJson(require.resolve('cordis/package.json'));
assertCordisPatchTarget(manifest.devDependencies.cordis, cordis.version);

// 版本守卫由本项目负责，补丁解析、应用与重复应用由成熟工具负责。
const patchManifestPath = require.resolve('patch-package/package.json');
const patchManifest = readJson(patchManifestPath);
const entry = typeof patchManifest.bin === 'string'
  ? patchManifest.bin
  : patchManifest.bin['patch-package'];
const cli = resolve(dirname(patchManifestPath), entry);
const result = spawnSync(process.execPath, [cli, '--error-on-fail'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
  timeout: 30000,
});
if (result.error) console.error('依赖补丁执行失败：', result.error);
process.exitCode = result.status ?? 1;

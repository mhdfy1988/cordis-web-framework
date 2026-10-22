import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { root, runNode } from './run.mjs';

const require = createRequire(import.meta.url);
// 补丁只在构建仓应用；消费包不带安装脚本，不接触消费方依赖目录。
runNode(['scripts/apply-dependency-patches.mjs']);
const installed = JSON.parse(readFileSync(require.resolve('cordis/package.json'), 'utf8'));
if (installed.version !== '4.0.0-rc.11') throw new Error('构建基线不匹配');
const entry = require.resolve('cordis');
if (!readFileSync(entry, 'utf8').includes('this._updateState(() => {});')) throw new Error('Cordis 修复没有实际应用');
const out = resolve(root, 'dist');
if (relative(root, out) !== 'dist') throw new Error('构建清理目标越界');
rmSync(out, { recursive: true, force: true });
runNode([require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json']);
const result = await build({ absWorkingDir: root, entryPoints: ['src/runtime-cordis/index.ts'],
  outfile: resolve(out, 'runtime-cordis/index.js'), bundle: true, format: 'esm', platform: 'browser',
  target: 'es2022', sourcemap: true, metafile: true, legalComments: 'inline',
  banner: { js: '/* Cordis 4.0.0-rc.11 + PR #133; MIT notices: THIRD_PARTY_NOTICES.md */' } });
if (Object.values(result.metafile.outputs).some(output => output.imports.some(item => item.external))) {
  throw new Error('Cordis 运行适配产物仍依赖外部运行时，拒绝交付');
}
mkdirSync(resolve(root, 'output'), { recursive: true });
writeFileSync(resolve(root, 'output/runtime-bundle-meta.json'), JSON.stringify(result.metafile, null, 2));
console.log('框架 ESM、声明及已修复的独立 Cordis 适配构建完成');

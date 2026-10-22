import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';

// 在完整工程外只复制消费输入，证明无相邻源码、依赖和开发产物仍可构建运行。
const npm = process.env.npm_execpath;
assert.ok(npm, '通过 npm.cmd run check:clean 执行');
mkdirSync('output', { recursive: true });
const destination = mkdtempSync(resolve('output/clean-documentation-'));
for (const name of ['application', 'build', 'content', 'tests', 'kit', 'packages', 'package.json', 'package-lock.json', 'tsconfig.json', 'THIRD_PARTY_NOTICES.md']) cpSync(resolve(name), resolve(destination, name), { recursive: true, filter: path => !path.replaceAll('\\', '/').split('/').some(part => part === 'node_modules' || part === 'dist') });
const steps = [['ci', '--ignore-scripts', '--no-audit', '--no-fund'], ['run', 'build'], ['test']];
for (const args of steps) {
  const result: SpawnSyncReturns<Buffer> = spawnSync(process.execPath, [npm, ...args], { cwd: destination, stdio: 'inherit', windowsHide: true });
  assert.equal(result.status, 0, `干净消费失败：${args.join(' ')}`);
}
writeFileSync('output/clean-site-check.json', JSON.stringify({ destination, steps, test: JSON.parse(readFileSync(resolve(destination, 'output/full-site-test.json'), 'utf8')), complete: true }, null, 2));
console.log('独立目录锁安装、完整构建和浏览器测试通过：' + destination);

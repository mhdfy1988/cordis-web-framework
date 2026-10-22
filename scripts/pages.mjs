import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, runNpm } from './run.mjs';
import { inputHashes, assertHashes } from './delivery-policy.mjs';

const directory = resolve(root, 'apps/docs');
const provenance = JSON.parse(readFileSync(resolve(directory, 'kit/provenance.json'), 'utf8'));
assert.equal(provenance.version, JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version);
assertHashes(inputHashes(root), provenance.inputs, '文档应用框架包不是当前源码的已验收候选，请先重建交付并同步 kit');
runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: directory, timeout: 180000 });
runNpm(['run', 'sync:docs', '--', root], { cwd: directory });
runNpm(['run', 'build'], { cwd: directory, timeout: 120000 });
runNpm(['test'], { cwd: directory, timeout: 180000 });
console.log('框架驱动完整文档应用已构建并验证；尚未调用远端部署');

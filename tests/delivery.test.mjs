import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from '../scripts/run.mjs';
import { json, checkMetadata, releaseBlockers, treeHashes, verifyTree, confined } from '../scripts/delivery-policy.mjs';
import { readFileSync } from 'node:fs';

const pkg = json(resolve(root, 'package.json')); const lock = json(resolve(root, 'package-lock.json'));
const baseline = json(resolve(root, 'compatibility/baseline.json')); const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');
test('本地候选允许 private／0.0.0，但锁与兼容基线必须一致', () => {
  checkMetadata(pkg, lock, changelog, baseline, '1.0.0');
  const badLock = structuredClone(lock); badLock.packages[''].dependencies.zod = '0.0.0';
  assert.throws(() => checkMetadata(pkg, badLock, changelog, baseline, '1.0.0'), /锁文件/);
  const badBaseline = structuredClone(baseline); badBaseline.exports = [];
  assert.throws(() => checkMetadata(pkg, lock, changelog, badBaseline, '1.0.0'), /公开入口/);
  assert.throws(() => checkMetadata(pkg, lock, changelog, baseline, '2.0.0'), /插件 API/);
  assert.throws(() => checkMetadata(pkg, lock, changelog + '\n## [Unreleased]\n', baseline, '1.0.0'), /Unreleased/);
  assert.throws(() => checkMetadata(pkg, lock, changelog + '\n### Unknown\n- error\n', baseline, '1.0.0'), /分类无效/);
});
test('正式发布门禁区分未授权候选及合法版本记录', () => {
  assert.ok(releaseBlockers({ ...pkg, version: '0.0.0', private: true, license: 'UNLICENSED' }, changelog).length >= 4);
  const version = '0.1.0'; const repositoryUrl = 'https://example.invalid/framework';
  const ready = { ...pkg, private: false, license: 'MIT', version };
  const log = `## [Unreleased]\n\n## [${version}] - 2026-10-21\n### Added\n- 验收\n[Unreleased]: ${repositoryUrl}/compare/v${version}...HEAD`;
  assert.deepEqual(releaseBlockers(ready, log, { licenseExists: true, repositoryUrl }), []);
  assert.ok(releaseBlockers(ready, log.replace('2026-10-21', '2026-02-31'), { licenseExists: true, repositoryUrl }).includes('版本日期无效或在未来'));
  assert.ok(releaseBlockers(ready, log + `\n## [${version}] - 2026-10-21`, { licenseExists: true, repositoryUrl }).length);
});
test('交付摘要检查拦截篡改、缺失、额外文件及路径越界', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'cordis-delivery-policy-'));
  writeFileSync(resolve(directory, 'asset.js'), 'ok'); const expected = treeHashes(directory); verifyTree(directory, expected);
  writeFileSync(resolve(directory, 'asset.js'), 'changed'); assert.throws(() => verifyTree(directory, expected), /交付内容变化/);
  writeFileSync(resolve(directory, 'asset.js'), 'ok'); writeFileSync(resolve(directory, 'extra'), 'secret'); assert.throws(() => verifyTree(directory, expected));
  rmSync(resolve(directory, 'extra')); rmSync(resolve(directory, 'asset.js')); assert.throws(() => verifyTree(directory, expected), /asset.js/);
  assert.throws(() => confined(directory, '../escape'), /越界/); assert.equal(confined(directory, 'kit'), resolve(directory, 'kit'));
});
test('真实 check:release 区分未满足条件、旧候选及就绪候选，不执行上传', () => {
  const result = spawnSync(process.execPath, ['scripts/delivery.mjs', 'release'], { cwd: root, encoding: 'utf8', windowsHide: true });
  const blockers = releaseBlockers(pkg, changelog, { licenseExists: true, repositoryUrl: pkg.repository?.url });
  if (blockers.length) {
    assert.notEqual(result.status, 0); assert.match(result.stderr, /正式发布被阻止/); assert.doesNotMatch(result.stdout, /前置条件通过/);
  } else if (result.status === 0) assert.match(result.stdout, /前置条件通过；未上传/);
  else { assert.match(result.stderr, /旧验收失效|验收证据|ENOENT|交付内容|源码|候选版本|候选名称|candidate|local-verified/); assert.doesNotMatch(result.stdout, /前置条件通过/); }
});

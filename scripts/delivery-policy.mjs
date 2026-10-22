import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import semver from 'semver';

export const json = path => JSON.parse(readFileSync(path, 'utf8'));
export const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
export function checkMetadata(pkg, lock, changelog, baseline, apiVersion) {
  assert.equal(semver.valid(pkg.version), pkg.version, '包版本必须是合法 SemVer');
  assert.equal(lock.name, pkg.name); assert.equal(lock.version, pkg.version);
  const root = lock.packages[''];
  for (const key of ['name', 'version', 'license', 'dependencies', 'devDependencies', 'peerDependencies', 'peerDependenciesMeta', 'engines']) {
    assert.deepEqual(root[key], pkg[key], `锁文件根字段不一致：${key}`);
  }
  for (const key of ['dependencies', 'peerDependencies', 'engines']) assert.deepEqual(pkg[key], baseline[key], `兼容基线变化：${key}，须评审迁移后更新基线`);
  assert.equal(pkg.devDependencies.cordis, baseline.cordis, 'Cordis 升级必须评审补丁与契约');
  assert.deepEqual(Object.keys(pkg.exports).sort(), baseline.exports, '公开入口变化须评审并更新兼容基线');
  assert.equal(apiVersion, baseline.pluginApiVersion, '插件 API 版本变化须评审迁移');
  assert.equal((changelog.match(/^## \[Unreleased\]$/gm) ?? []).length, 1, '必须且只能有一个 Unreleased');
  const headings = [...changelog.matchAll(/^### (.+)$/gm)].map(match => match[1]);
  for (const heading of headings) assert.ok(['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'].includes(heading), `更新日志分类无效：${heading}`);
  for (const section of changelog.split(/^### .+$/m).slice(1)) assert.match(section.split(/^## /m)[0], /^- \S/m, '更新日志分类不能为空');
}

// 正式发布条件与本地候选条件分开；这个函数不会上传、登录或修改版本。
export function releaseBlockers(pkg, changelog, { licenseExists = false, repositoryUrl } = {}) {
  const issues = [];
  if (pkg.private !== false) issues.push('包仍为 private');
  if (!pkg.license || pkg.license === 'UNLICENSED' || !licenseExists) issues.push('尚未确认并提供项目许可证');
  if (!semver.valid(pkg.version) || pkg.version === '0.0.0') issues.push('尚未确认正式候选版本');
  if (!repositoryUrl || !/^https:\/\//.test(repositoryUrl)) issues.push('尚未确认发布仓库');
  const escaped = pkg.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const versions = [...changelog.matchAll(new RegExp(`^## \\[${escaped}\\] - (\\d{4}-\\d{2}-\\d{2})$`, 'gm'))];
  if (versions.length !== 1) issues.push('缺少唯一、带日期的当前版本更新日志');
  else {
    const date = versions[0][1]; const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date > new Date().toISOString().slice(0, 10)) issues.push('版本日期无效或在未来');
  }
  if (repositoryUrl && !changelog.includes(`[Unreleased]: ${repositoryUrl}/compare/`)) issues.push('缺少更新日志比较链接');
  return issues;
}

/** 只收集明确归属的构建／契约输入，不收输出、依赖、数据库和实时进度文件。 */
export function inputHashes(root) {
  const result = {};
  const visit = path => {
    const stat = lstatSync(path); assert.ok(!stat.isSymbolicLink(), '交付输入不接受符号链接');
    if (stat.isDirectory()) for (const name of readdirSync(path).sort()) {
      if (relative(root, resolve(path, name)).replaceAll('\\', '/') !== 'docs/implementation-plan.md') visit(resolve(path, name));
    }
    else result[relative(root, path).replaceAll('\\', '/')] = digest(path);
  };
  for (const name of ['src', 'scripts', 'tests', 'examples', 'templates', 'compatibility', 'patches', 'experiments', 'docs',
    'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.test.json', 'README.md', 'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md',
    'docs-site/package.json', 'docs-site/package-lock.json', 'docs-site/model.mjs', 'docs-site/check-links.mjs', 'docs-site/.vitepress/config.mjs', 'docs-site/.vitepress/theme']) visit(resolve(root, name));
  try { visit(resolve(root, 'LICENSE')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return result;
}
export function treeHashes(directory) {
  const result = {};
  const visit = path => {
    assert.ok(!lstatSync(path).isSymbolicLink(), '交付内容不接受符号链接');
    if (lstatSync(path).isDirectory()) for (const name of readdirSync(path).sort()) visit(resolve(path, name));
    else result[relative(directory, path).replaceAll('\\', '/')] = digest(path);
  }; visit(directory); return result;
}
export function assertHashes(actual, expected, message) {
  const changed = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].filter(key => actual[key] !== expected[key]);
  // 只报告变化路径，不将整份源码清单和摘要灌入错误日志。
  if (changed.length) throw new Error(`${message}：${changed.slice(0, 12).join('、')}${changed.length > 12 ? `，共 ${changed.length} 项` : ''}`);
}
export function verifyTree(directory, expected) { assertHashes(treeHashes(directory), expected, '交付内容变化或不完整，必须重新验收'); }
export function confined(directory, path) {
  const target = resolve(directory, path); const rel = relative(directory, target);
  assert.ok(rel && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\'), '候选路径越界'); return target;
}

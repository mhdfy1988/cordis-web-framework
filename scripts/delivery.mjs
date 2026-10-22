import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, cpSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, runNpm } from './run.mjs';
import { json, checkMetadata, releaseBlockers, inputHashes, treeHashes, verifyTree, confined, assertHashes } from './delivery-policy.mjs';
import { exportTemplates, checkTemplates } from './delivery-templates.mjs';

const mode = process.argv[2];
const pkg = json(resolve(root, 'package.json'));
function metadata() {
  const source = readFileSync(resolve(root, 'src/contracts/composition.ts'), 'utf8');
  const apiVersion = /PLUGIN_API_VERSION = '([^']+)'/.exec(source)?.[1];
  checkMetadata(pkg, json(resolve(root, 'package-lock.json')), readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8'),
    json(resolve(root, 'compatibility/baseline.json')), apiVersion);
}
const output = resolve(root, 'output'); const pointer = resolve(output, 'delivery-result.json');
if (mode === 'metadata' || mode === 'release') {
  metadata();
  if (mode === 'release') {
    const issues = releaseBlockers(pkg, readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8'), {
      licenseExists: existsSync(resolve(root, 'LICENSE')), repositoryUrl: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url });
    if (issues.length) throw new Error(`正式发布被阻止：\n${issues.join('\n')}`);
    // 即使元数据完整，也必须有当前候选的本地验收证据。
    verify(); console.log('本地正式发布前置条件通过；未上传，仍需渠道授权及远端验收');
  } else console.log('本地候选元数据与兼容基线通过；不代表正式发布就绪');
} else if (mode === 'verify') { metadata(); verify(); console.log('交付候选与当前输入／产物一致；未执行远端发布'); }
else if (mode === 'check') {
  metadata(); const before = inputHashes(root);
  // 先运行完整回归，再由既有工程外链路构造并验收唯一 tarball。
  runNpm(['test'], { timeout: 180000 });
  runNpm(['run', 'test:npm:browser'], { timeout: 90000 });
  runNpm(['run', 'test:package'], { timeout: 300000 });
  const packages = json(resolve(output, 'package-check-result.json'));
  const candidate = resolve(output, 'delivery', randomUUID()); const kit = resolve(candidate, 'kit');
  exportTemplates(kit, packages.tarball);
  cpSync(resolve(root, 'docs'), resolve(kit, 'docs'), { recursive: true });
  for (const file of ['CHANGELOG.md', 'THIRD_PARTY_NOTICES.md', 'LICENSE']) cpSync(resolve(root, file), resolve(kit, file));
  writeFileSync(resolve(kit, 'README.md'), '# 本地交付候选\n\n由当前源码验收生成的交付候选；自有代码采用 MIT。是否已经上传见对应 GitHub Release，候选文件存在不等于渠道已发布。\n\n从[开发者手册](docs/guide/index.md)开始，再查[API 参考](docs/reference/index.md)。三个可搬移模板见 templates/browser、templates/node、templates/fullstack 及各自 README。必须保留 framework.tgz 的相对位置。\n\n[交付与升级说明](docs/w6-delivery.md)。docs 内实施计划为封存时快照，不是源项目的实时指针；历史来源链接可能指向未随候选分发的参考仓库，不影响使用主线。\n');
  const templates = await checkTemplates(kit, candidate);
  assert.equal(`sha512-${createHash('sha512').update(readFileSync(resolve(kit, 'framework.tgz'))).digest('base64')}`, packages.integrity);
  assert.equal(packages.integrity, templates.node.integrity);
  assertHashes(inputHashes(root), before, '验收期间输入改变，不能封存证据');
  const report = { formatVersion: 1, status: 'local-verified', createdAt: new Date().toISOString(),
    kit: `delivery/${candidate.split(/[\\/]/).at(-1)}/kit`, packageName: pkg.name, version: pkg.version,
    integrity: packages.integrity, inputs: before, files: treeHashes(kit), node: process.version,
    packageEvidence: packages, templates, published: false, deployed: false,
    releaseBlockers: releaseBlockers(pkg, readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')) };
  mkdirSync(output, { recursive: true }); writeFileSync(resolve(candidate, 'evidence.json'), JSON.stringify(report, null, 2));
  // 只有本次全部成功才替换指针，失败不伪造新成功。
  writeFileSync(pointer, JSON.stringify(report, null, 2)); verify();
  console.log(`本地交付验收完成：${kit}`);
} else throw new Error('用法：delivery.mjs metadata | check | verify | release');

function verify() {
  const report = json(pointer); assert.equal(report.formatVersion, 1); assert.equal(report.status, 'local-verified');
  assert.equal(report.packageName, pkg.name, '候选名称与当前包不一致'); assert.equal(report.version, pkg.version, '候选版本与当前包不一致，必须重新验收');
  assertHashes(inputHashes(root), report.inputs, '源码／配置／模板变化，旧验收失效');
  const kit = confined(resolve(output, 'delivery'), report.kit.replace(/^delivery\//, ''));
  verifyTree(kit, report.files);
  assert.equal(`sha512-${createHash('sha512').update(readFileSync(resolve(kit, 'framework.tgz'))).digest('base64')}`, report.integrity);
}

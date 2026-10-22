import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { root, runNode } from './run.mjs';
import { siteRoot, sources, content, basePath } from '../docs-site/model.mjs';
import { docsInputs } from './docs-static.mjs';
const base = basePath(process.env.DOCS_BASE_PATH);
runNode(['scripts/build.mjs']);
runNode(['scripts/docs-check.mjs'], { timeout: 60000 });
assert.ok(existsSync(resolve(siteRoot, 'node_modules/vitepress/bin/vitepress.js')), '请先执行 npm.cmd ci --prefix docs-site --ignore-scripts');
const generated = resolve(siteRoot, '.generated'); assert.equal(relative(siteRoot, generated), '.generated');
rmSync(generated, { recursive: true, force: true }); mkdirSync(generated, { recursive: true });
for (const [page, source] of sources()) {
  const target = resolve(generated, page); mkdirSync(resolve(target, '..'), { recursive: true }); writeFileSync(target, content(page, source));
}
const publicDir = resolve(generated, 'public/examples'); mkdirSync(publicDir, { recursive: true });
for (const name of ['plugins.mjs', 'http.mjs', 'ui.mjs', 'ui.html']) cpSync(resolve(root, 'docs/examples', name), resolve(publicDir, name + '.txt'));
runNode(['docs-site/node_modules/vitepress/bin/vitepress.js', 'build', 'docs-site'], { timeout: 180000 });
const { treeHashes } = await import('./delivery-policy.mjs');
writeFileSync(resolve(root, 'output/docs-site-build.json'), JSON.stringify({ base, pages: [...sources().keys()], localOnly: true,
  inputs: docsInputs(), files: treeHashes(resolve(root, 'output/docs-site')) }, null, 2));
console.log(`文档静态构建完成，基础路径：${base}；未部署`);

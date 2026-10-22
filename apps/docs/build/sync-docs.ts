import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
const source = resolve(process.argv[2] ?? ''); assert.ok(process.argv[2], '用法：npm.cmd run sync:docs -- <文档源项目目录>');
const destination = resolve('content'); assert.notEqual(source, destination);
const files: Record<string, string> = {};
function copy(file: string) {
  const bytes = readFileSync(resolve(source, file)); const target = resolve(destination, file); mkdirSync(resolve(target, '..'), { recursive: true });
  cpSync(resolve(source, file), target); files[file] = createHash('sha256').update(bytes).digest('hex');
}
function visit(directory: string) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) visit(path); else if (/\.(md|mjs|html)$/.test(item.name)) copy(relative(source, path).replaceAll('\\', '/'));
  }
}
visit(resolve(source, 'docs'));
for (const file of ['README.md', 'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md', 'patches/README.md']) copy(file);
writeFileSync(resolve(destination, 'source-files.json'), JSON.stringify({ syncedAt: new Date().toISOString(), files }, null, 2));
console.log('仅同步文档／教程文件，不复制框架实现；公开许可另行确认：', Object.keys(files).length);

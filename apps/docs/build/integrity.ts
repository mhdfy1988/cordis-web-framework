import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import assert from 'node:assert/strict';
export function digest(path: string) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
export function tree(directory: string): Record<string, string> {
  const files: Record<string, string> = {};
  function visit(path: string) { for (const item of readdirSync(path, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error('交付输入不能包含符号链接');
    const file = resolve(path, item.name);
    if (item.isDirectory()) visit(file); else files[relative(directory, file).replaceAll('\\', '/')] = digest(file);
  } }
  visit(directory); return files;
}
export function applicationInputs() {
  const files: Record<string, string> = {};
  for (const folder of ['application', 'build', 'content', 'packages/default-ui/src']) for (const [file, hash] of Object.entries(tree(resolve(folder)))) files[folder + '/' + file] = hash;
  for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'THIRD_PARTY_NOTICES.md', 'kit/framework.tgz', 'packages/default-ui/package.json', 'packages/default-ui/tsconfig.json', 'packages/default-ui/build.ts']) files[file] = digest(file);
  return files;
}
export function verifyBuild(build: { inputs: Record<string, string>; artifacts: Record<string, string>; outDir: string }) {
  assert.deepEqual(applicationInputs(), build.inputs, '输入改变，请重新构建');
  assert.deepEqual(tree(build.outDir), build.artifacts, '站点产物与构建记录不一致');
}

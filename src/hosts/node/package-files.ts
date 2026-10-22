import { readdir, readFile, lstat, realpath } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { packageDigest } from '../../plugin-management/packages.ts';

export function inside(root: string, path: string): string {
  const value = resolve(root, path); const rel = relative(root, value);
  if (!rel || rel.startsWith('..') || resolve(value) === resolve(root)) throw new Error('包路径越界');
  return value;
}
export async function packageFile(root: string, path: string): Promise<string> {
  const file = inside(root, path); const actualRoot = await realpath(root); const actual = await realpath(file);
  inside(actualRoot, relative(actualRoot, actual));
  if (!(await lstat(actual)).isFile()) throw new Error('包文件无效');
  return actual;
}
/** 安装树含依赖与锁文件；不允许链接逃逸，不把目录名当完整性证明。 */
export async function treeDigest(root: string): Promise<string> {
  let size = 0; const files: Record<string, string> = {};
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.bin' || entry.name === '.package-lock.json') continue;
      const path = resolve(directory, entry.name); const stat = await lstat(path);
      if (stat.isSymbolicLink()) throw new Error('安装树不允许符号链接');
      if (stat.isDirectory()) await visit(path);
      else if (stat.isFile()) {
        size += stat.size;
        if (size > 67_108_864 || Object.keys(files).length >= 4096) throw new Error('标准包安装树超过预算');
        files[relative(root, path).replaceAll('\\', '/')] = createHash('sha256').update(await readFile(path)).digest('hex');
      } else throw new Error('安装树包含特殊文件');
    }
  }
  await visit(root); return packageDigest(files);
}
export function assetType(path: string): string {
  const type: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css', '.txt': 'text/plain' };
  const value = type[extname(path).toLowerCase()]; if (!value) throw new Error('不支持的包资源类型'); return value;
}

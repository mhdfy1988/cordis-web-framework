import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit',
    windowsHide: true, timeout: 60000, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`命令失败 (${result.status})：node ${args.join(' ')}\n${result.stderr ?? ''}`);
  return result;
}
export function runNpm(args, options = {}) {
  if (!process.env.npm_execpath) throw new Error('请通过 npm.cmd run 执行此脚本，确保使用同一 npm');
  return runNode([process.env.npm_execpath, ...args], options);
}

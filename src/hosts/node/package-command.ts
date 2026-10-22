import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface NpmRunnerOptions { readonly npmCli?: string; readonly timeoutMs?: number }
/** 不经过 shell；仅运行 npm CLI，安装脚本由调用参数禁用。 */
export async function runPackageCommand(args: readonly string[], cwd: string, options: NpmRunnerOptions,
  signal?: AbortSignal): Promise<string> {
  const cli = options.npmCli ?? [process.env.npm_execpath,
    resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')].find(path => path && existsSync(path));
  if (!cli || !existsSync(cli)) throw new Error('找不到 npm CLI，请显式配置 npmCli');
  signal?.throwIfAborted();
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let cancelled = false;
    const stop = () => { cancelled = true; child.kill(); };
    const timer = setTimeout(stop, options.timeoutMs ?? 120000);
    signal?.addEventListener('abort', stop, { once: true });
    // 不回传 npm 原始日志：其中可能含私有 registry／凭据／任意安装路径。
    child.stdout.on('data', chunk => { output = (output + String(chunk)).slice(-65536); });
    child.stderr.on('data', () => {});
    child.once('error', error => { clearTimeout(timer); signal?.removeEventListener('abort', stop); reject(error); });
    child.once('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', stop);
      if (cancelled) reject(new Error('包操作已取消或超时'));
      else if (code !== 0) reject(new Error(`npm 包操作失败（退出码 ${code}），未执行插件入口`));
      else accept(output);
    });
  });
}

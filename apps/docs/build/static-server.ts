import { context } from 'esbuild';
import { resolve } from 'node:path';
import { cpSync, mkdtempSync, mkdirSync } from 'node:fs';

// 复制固定产物到独立目录，避免构建或验收影响正在查看的入口。
export async function serveDocumentation(directory: string, base: string) {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw new Error('非法静态基础路径');
  mkdirSync('output', { recursive: true });
  const staging = mkdtempSync(resolve('output/documentation-preview-'));
  cpSync(directory, resolve(staging, '.' + base), { recursive: true });
  const server = await context({});
  try {
    const address = await server.serve({ host: '127.0.0.1', port: 0, servedir: staging });
    return { url: `http://127.0.0.1:${address.port}${base}`, close: () => server.dispose() };
  } catch (error) { await server.dispose(); throw error; }
}

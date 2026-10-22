import { mkdir, open, readFile, rename, unlink, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import type { PluginStore } from '../../contracts/management.ts';

/** 独占锁属于管理器存活期；遗留锁显式报错，不按超时抢占仍在运行的进程。 */
export function createNodePluginStore(filename: string): PluginStore {
  const file = resolve(filename);
  const lock = file + '.lock';
  let acquired = false;
  async function read() {
    if (!acquired) throw new Error('未获取插件库');
    try {
      if ((await stat(file)).size > 33_554_432) throw new Error('插件库超过 32 MiB');
      return JSON.parse(await readFile(file, 'utf8')) as unknown;
    } catch (error) { if ((error as { code?: string }).code === 'ENOENT') return undefined; throw error; }
  }
  return {
    async acquire() {
      if (acquired) throw new Error('插件库已被占用');
      await mkdir(dirname(file), { recursive: true });
      const handle = await open(lock, 'wx');
      try { await handle.writeFile(JSON.stringify({ pid: process.pid })); } catch (error) { await handle.close(); await unlink(lock); throw error; }
      acquired = true;
      return async () => { if (!acquired) return; await handle.close(); await unlink(lock); acquired = false; };
    },
    read,
    async write(expectedRevision, document) {
      const old = await read() as { revision?: number } | undefined;
      if ((old?.revision ?? 0) !== expectedRevision || document.revision !== expectedRevision + 1) throw new Error('插件库修订冲突');
      const text = JSON.stringify(document);
      if (Buffer.byteLength(text) > 33_554_432) throw new Error('插件库超过 32 MiB');
      const temporary = file + '.' + crypto.randomUUID() + '.tmp';
      try {
        const handle = await open(temporary, 'wx');
        try { await handle.writeFile(text, 'utf8'); await handle.sync(); } finally { await handle.close(); }
        await rename(temporary, file);
      } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    },
  };
}

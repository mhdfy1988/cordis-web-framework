import type { InstallationDocument, PluginStore } from '../contracts/management.ts';

/** 仅用于临时实例与故障测试；不宣称进程重启持久化。 */
export function createMemoryPluginStore(): PluginStore {
  let value: InstallationDocument | undefined;
  let acquired = false;
  return {
    async acquire() {
      if (acquired) throw new Error('插件库已被占用');
      acquired = true;
      let released = false;
      return () => { if (!released) { released = true; acquired = false; } };
    },
    async read() { if (!acquired) throw new Error('未获取插件库'); return structuredClone(value); },
    async write(revision, next) {
      if (!acquired || revision !== (value?.revision ?? 0) || next.revision !== revision + 1) throw new Error('插件库修订冲突');
      value = structuredClone(next);
    },
  };
}

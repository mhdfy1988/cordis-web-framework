import type { PluginStore } from '../../contracts/management.ts';

export function createBrowserPluginStore(name: string): PluginStore {
  if (!name.trim() || name.length > 200) throw new TypeError('插件库名称无效');
  let db: IDBDatabase | undefined;
  let releaseLock: (() => void) | undefined;
  let holding: Promise<unknown> | undefined;
  function database() { if (!db) throw new Error('未获取插件库'); return db; }
  return {
    async acquire() {
      if (holding || !navigator.locks) throw new Error('插件库已占用或宿主不支持 Web Locks');
      const acquired = Promise.withResolvers<void>();
      const released = Promise.withResolvers<void>();
      holding = navigator.locks.request('cw-plugins:' + name, { ifAvailable: true }, async lock => {
        if (!lock) { acquired.reject(new Error('插件库已被其他页面占用')); return; }
        acquired.resolve(); await released.promise;
      });
      holding.catch(acquired.reject);
      releaseLock = released.resolve;
      try {
        await acquired.promise;
        db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('cw-plugins:' + name, 1);
          request.onupgradeneeded = () => { request.result.createObjectStore('state'); };
          request.onsuccess = () => { resolve(request.result); };
          request.onerror = () => { reject(request.error); };
          request.onblocked = () => { reject(new Error('插件库升级被其他页面阻塞')); };
        });
      } catch (error) { released.resolve(); await holding; holding = undefined; throw error; }
      return async () => { db?.close(); db = undefined; releaseLock?.(); await holding; holding = undefined; releaseLock = undefined; };
    },
    async read() {
      return new Promise<unknown>((resolve, reject) => {
        const tx = database().transaction('state', 'readonly');
        const request = tx.objectStore('state').get('document');
        tx.oncomplete = () => { resolve(request.result); };
        tx.onabort = tx.onerror = () => { reject(tx.error ?? new Error('插件库读取失败')); };
      });
    },
    async write(revision, document) {
      if (new TextEncoder().encode(JSON.stringify(document)).byteLength > 33_554_432) throw new Error('插件库超过 32 MiB');
      return new Promise<void>((resolve, reject) => {
        const tx = database().transaction('state', 'readwrite');
        const store = tx.objectStore('state');
        const request = store.get('document');
        request.onsuccess = () => {
          if ((request.result?.revision ?? 0) !== revision || document.revision !== revision + 1) { tx.abort(); return; }
          store.put(document, 'document');
        };
        tx.oncomplete = () => { resolve(); };
        tx.onabort = tx.onerror = () => { reject(tx.error ?? new Error('插件库写入失败或修订冲突')); };
      });
    },
  };
}

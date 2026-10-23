import type { PluginStore } from '../../contracts/management.ts';

export function createBrowserPluginStore(name: string): PluginStore {
  if (!name.trim() || name.length > 200) throw new TypeError('插件库名称无效');
  let db: IDBDatabase | undefined;
  const key = 'cw-plugins:' + name;
  let opening = false;
  let channel: BroadcastChannel | undefined;
  const listeners = new Set<() => void>();
  function database() { if (!db) throw new Error('未获取插件库'); return db; }
  function notify() { for (const listener of [...listeners]) listener(); }
  const onVisible = () => { if (document.visibilityState === 'visible') notify(); };
  return {
    async acquire() {
      if (db || opening) throw new Error('插件库连接已占用');
      if (!navigator.locks || typeof BroadcastChannel === 'undefined') throw new Error('宿主不支持 Web Locks 或 BroadcastChannel');
      opening = true;
      try {
        db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(key, 1);
          let rejected = false;
          request.onupgradeneeded = () => { request.result.createObjectStore('state'); };
          request.onsuccess = () => { if (rejected) request.result.close(); else resolve(request.result); };
          request.onerror = () => { reject(request.error); };
          request.onblocked = () => { rejected = true; reject(new Error('插件库升级被其他页面阻塞')); };
        });
        channel = new BroadcastChannel(key);
        channel.onmessage = notify;
        window.addEventListener('focus', notify);
        document.addEventListener('visibilitychange', onVisible);
      } catch (error) { db?.close(); db = undefined; throw error; }
      finally { opening = false; }
      const connection = db;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        connection.close(); db = undefined;
        channel?.close(); channel = undefined; listeners.clear();
        window.removeEventListener('focus', notify);
        document.removeEventListener('visibilitychange', onVisible);
      };
    },
    async exclusive(operation) {
      database();
      return navigator.locks.request(key, async () => { database(); return operation(); });
    },
    subscribe(listener) {
      database(); listeners.add(listener);
      return () => { listeners.delete(listener); };
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
      await new Promise<void>((resolve, reject) => {
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
      channel?.postMessage(null);
    },
  };
}

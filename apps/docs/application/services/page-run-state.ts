/** 页面暂停只属于当前标签页，不写入共享的插件启停意愿。 */
export function createPageRunState(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, base: string) {
  const key = 'cordis-docs:' + base + ':page-paused:v1';
  return {
    paused() {
      const value = storage.getItem(key);
      if (value !== null && value !== 'paused') throw new Error('页面暂停记录无效，请核对浏览器会话存储');
      return value === 'paused';
    },
    pause() { storage.setItem(key, 'paused'); },
    resume() { storage.removeItem(key); },
  };
}

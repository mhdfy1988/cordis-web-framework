import assert from 'node:assert/strict';
import test from 'node:test';
import { createPageRunState } from '../application/services/page-run-state.ts';

test('页面暂停：重建后保留、显式恢复、按基础路径隔离且不改插件配置', () => {
  const values = new Map<string, string>([['plugin-settings', 'untouched']]);
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const state = createPageRunState(storage, '/docs/');
  assert.equal(state.paused(), false); state.pause();
  assert.equal(createPageRunState(storage, '/docs/').paused(), true);
  assert.equal(createPageRunState(storage, '/other/').paused(), false);
  state.resume(); assert.equal(state.paused(), false);
  assert.deepEqual([...values], [['plugin-settings', 'untouched']]);
  values.set('cordis-docs:/docs/:page-paused:v1', 'broken');
  assert.throws(() => state.paused(), /记录无效/);
});
test('页面暂停：存储拒绝时显式失败，不假报已保存／已恢复', () => {
  const state = createPageRunState({ getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } }, '/');
  for (const operation of [state.paused, state.pause, state.resume]) assert.throws(operation, /blocked/);
});

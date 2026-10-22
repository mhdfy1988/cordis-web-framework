import MiniSearch from 'minisearch';
import { ref, shallowRef } from 'vue';
import { searchOptions } from '../shared/documents.ts';
import type { Search } from './contracts.ts';
export function createSearch(base: string): Search {
  const open = ref(false); const query = ref(''); const results: Search['results'] = shallowRef([]); const error = ref('');
  let index: MiniSearch | undefined; let pending: Promise<void> | undefined; const controller = new AbortController(); let closed = false;
  function queryChanged() {
    results.value = index && query.value.trim() ? index.search(query.value, { prefix: true, fuzzy: .15, boost: { title: 4 } }).slice(0, 15)
      .map(item => ({ id: String(item.id), title: String(item.title), route: String(item.route) })) : [];
  }
  return { open, query, results, error, queryChanged, async show() {
    if (closed) throw new Error('搜索插件已关闭'); open.value = true;
    if (!index && !pending) pending = (async () => {
      error.value = '';
      try {
        const response = await fetch(base + 'search.json', { signal: controller.signal }); if (!response.ok) throw new Error('搜索索引读取失败');
        index = MiniSearch.loadJSON(await response.text(), searchOptions); queryChanged();
      } catch (problem) { if (!closed) error.value = problem instanceof Error ? problem.message : '搜索失败'; }
      finally { pending = undefined; }
    })();
    await pending;
  }, close() { open.value = false; }, dispose() { closed = true; controller.abort(); open.value = false; index = undefined; results.value = []; } };
}

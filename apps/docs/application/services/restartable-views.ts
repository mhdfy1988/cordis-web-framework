import type { Preferences, Search } from './contracts.ts';

// Vue 注入入口保持稳定；每次插件激活都更新其本次服务，不复用已释放的搜索或主题对象。
export function createRestartableViews() {
  let search: Search; let preferences: Preferences;
  return {
    acceptSearch(value: Search) { search = value; }, acceptPreferences(value: Preferences) { preferences = value; },
    search: {
      get open() { return search.open; }, get query() { return search.query; }, get results() { return search.results; }, get error() { return search.error; },
      show: () => search.show(), close: () => search.close(), queryChanged: () => search.queryChanged(), dispose: () => search.dispose(),
    } satisfies Search,
    preferences: { get dark() { return preferences.dark; }, toggle: () => preferences.toggle() } satisfies Preferences,
  };
}

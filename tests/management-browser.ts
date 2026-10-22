import { createBrowserPluginStore } from '../src/hosts/browser/plugin-store.ts';
import { createBrowserPluginLoader } from '../src/hosts/browser/plugin-loader.ts';
import { artifactIntegrity } from '../src/plugin-management/artifact.ts';
import { createCordisRuntime } from '../src/runtime-cordis/index.ts';
import { startVueHost } from '../src/presentation-vue/index.ts';
import { createVueViewCatalog } from '../src/presentation-vue/catalog.ts';
import { createVueUi } from '../src/presentation-vue/ui.ts';
import { createUiRegistry } from '../src/ui-registry/index.ts';
import { createBrowserPluginResources } from '../src/hosts/browser/plugin-resources.ts';
import { h, nextTick } from 'vue';
import { startLateHarness } from './management-late-browser.ts';

const environment = { platform: 'browser' as const, capabilities: [] };
function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
async function rejects(fn: () => Promise<unknown>) { try { await fn(); } catch { return; } throw new Error('应拒绝却成功'); }
const store = createBrowserPluginStore('p3-real-browser');
const release = await store.acquire();
try {
  await rejects(() => createBrowserPluginStore('p3-real-browser').acquire());
  const previous = await store.read() as { revision: number } | undefined;
  const revision = previous?.revision ?? 0;
  await store.write(revision, { formatVersion: 1, revision: revision + 1, plugins: [] });
  assert((await store.read() as { revision: number }).revision === revision + 1, '事务实际回读');
  assert(!sessionStorage.getItem('previousRevision') || revision > 0, '刷新未丢失 IndexedDB');
  sessionStorage.setItem('previousRevision', String(revision + 1));
  await rejects(() => store.write(0, { formatVersion: 1, revision: 1, plugins: [] }));
  const content = { formatVersion: 1 as const, manifest: { id: 'p3', version: '1.0.0', apiVersion: '^1', requires: [], provides: [] },
    entries: { browser: 'export default manifest => ({manifest,prepare:()=>({ok:true,value(){}})})' }, assets: [] };
  const loader = createBrowserPluginLoader();
  const lease = await loader.load({ ...content, integrity: await artifactIntegrity(content) }, environment);
  assert(lease.plugin.manifest.id === 'p3', '真实 Blob 工厂'); await lease.release();
  const bad = { ...content, entries: { browser: 'export default 2' } };
  await rejects(async () => loader.load({ ...bad, integrity: await artifactIntegrity(bad) }, environment));
} finally { await release(); }
const registry = createUiRegistry(); const catalog = createVueViewCatalog();
const resources = createBrowserPluginResources();
const ui = createVueUi({ registry, views: catalog.views, onError: () => { throw new Error('动态组件错误'); } });
const target = document.createElement('main'); document.body.append(target);
const builtin = { manifest: { id: 'preview', version: '1.0.0', apiVersion: '^1', requires: [], provides: [{ id: 'framework.preview', version: '1.0.0' }] },
  prepare: () => ({ ok: true as const, value(scope: import('../src/contracts/runtime.ts').PluginScope) {
    scope.provide({ id: 'framework.preview' }, { h, register(pluginScope: import('../src/contracts/runtime.ts').PluginScope) {
      catalog.register(pluginScope, 'dynamic-card', { render: () => h('p', { id: 'dynamic-card' }, '独立插件的动态组件') });
      resources.style(pluginScope, 'dynamic-card', '#dynamic-card { color: rgb(12, 34, 56); }');
      const contribution = registry.register({ id: 'dynamic-card', target: 'root', range: '^1', renderer: 'vue', view: 'dynamic-card' });
      pluginScope.onDispose(() => { contribution.dispose(); });
    } });
  } }) };
const host = await startVueHost({ target, component: ui.Root, onError: error => { throw error; },
  document: { formatVersion: 1, plugins: [], bindings: {} }, catalog: new Map(), createRuntime: createCordisRuntime,
  management: { store: createBrowserPluginStore('p5-ui'), loader: createBrowserPluginLoader(), builtins: [{ plugin: builtin, required: true }] } });
try {
  const content = { formatVersion: 1 as const, manifest: { id: 'dynamic-ui', version: '1.0.0', apiVersion: '^1',
    requires: [{ id: 'framework.preview', range: '^1' }], provides: [] }, entries: {
    browser: `export default manifest => ({manifest,prepare:()=>({ok:true,value(scope){scope.get({id:'framework.preview'}).register(scope)}})})` }, assets: [] };
  const artifact = { ...content, integrity: await artifactIntegrity(content) };
  await host.management!.install(artifact, { acceptedIntegrity: artifact.integrity, bindings: { 'framework.preview': 'preview' } });
  for (let round = 0; round < 3; round++) {
    await host.management!.enable('dynamic-ui'); await nextTick();
    assert(target.querySelector('#dynamic-card')?.textContent === '独立插件的动态组件', '真实动态组件呈现');
    assert(getComputedStyle(target.querySelector('#dynamic-card')!).color === 'rgb(12, 34, 56)', '动态样式生效');
    await host.management!.disable('dynamic-ui'); await nextTick();
    assert(!target.querySelector('#dynamic-card') && !document.querySelector('[data-plugin-style]'), '动态资源真实撤销');
    assert(host.inspect().state === 'ready' && catalog.inspect().views === 0, '可选插件停用仍就绪');
  }
  await host.management!.uninstall('dynamic-ui');
} finally { await host.stop(); registry.close(); }
assert(target.children.length === 0, '宿主实际卸载');
await startLateHarness();
document.documentElement.dataset.management = 'passed';

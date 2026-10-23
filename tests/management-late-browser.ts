import { h, nextTick } from 'vue';
import { createCordisRuntime } from '../src/runtime-cordis/index.ts';
import { startVueHost } from '../src/presentation-vue/index.ts';
import { createVueViewCatalog } from '../src/presentation-vue/catalog.ts';
import { createVueUi } from '../src/presentation-vue/ui.ts';
import { createUiRegistry } from '../src/ui-registry/index.ts';
import { createBrowserPluginStore, createBrowserPluginLoader, createBrowserPluginResources } from '../src/hosts/browser/plugins.ts';
import type { PluginScope } from '../src/contracts/runtime.ts';
import type { Component } from 'vue';

export async function startLateHarness() {
  // 源码和工程外公开包消费共用同一个越代释放回归。
  const store = createBrowserPluginStore('p7-store-generation');
  const first = await store.acquire(); await Promise.all([first(), first()]);
  const second = await store.acquire();
  try {
    await first();
    const current = await store.read() as { revision: number } | undefined;
    const revision = current?.revision ?? 0;
    await store.write(revision, { formatVersion: 1, revision: revision + 1, plugins: [] });
    let rejected = false;
    try { const unexpected = await store.acquire(); await unexpected(); }
    catch { rejected = true; }
    if (!rejected) throw new Error('过期释放句柄关闭了新一轮浏览器安装库连接');
    const peer = createBrowserPluginStore('p7-store-generation');
    const releasePeer = await peer.acquire(); await releasePeer();
  } finally { await Promise.all([second(), second()]); }
  const urls = new Set<string>();
  const originalCreate = URL.createObjectURL.bind(URL); const originalRevoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = blob => { const url = originalCreate(blob); urls.add(url); return url; };
  URL.revokeObjectURL = url => { urls.delete(url); originalRevoke(url); };
  const registry = createUiRegistry(); const catalog = createVueViewCatalog(); const resources = createBrowserPluginResources();
  const ui = createVueUi({ registry, views: catalog.views, onError: () => { throw new Error('late-ui-error'); } });
  const target = document.createElement('main'); document.body.append(target);
  const builtin = { manifest: { id: 'presentation', version: '1.0.0', apiVersion: '^1', requires: [], provides: [{ id: 'framework.presentation', version: '1.0.0' }] },
    prepare: () => ({ ok: true as const, value(scope: PluginScope) {
      scope.provide({ id: 'framework.presentation' }, { h, register(owner: PluginScope, component: Component, css: string) {
        catalog.register(owner, 'late', component); resources.style(owner, 'late', css);
        const lease = registry.register({ id: 'late', target: 'root', view: 'late', renderer: 'vue', range: '^1' }); owner.onDispose(() => lease.dispose());
      } });
    } }) };
  const host = await startVueHost({ target, component: ui.Root, createRuntime: createCordisRuntime, onError: error => { throw error; },
    document: { formatVersion: 1, plugins: [], bindings: {} }, catalog: new Map(), management: {
      store: createBrowserPluginStore('p7-late-package'), loader: createBrowserPluginLoader(), builtins: [{ plugin: builtin, required: true }],
    } });
  const manager = host.management!;
  Object.assign(globalThis, { managementHarness: {
    snapshot: () => manager.inspect(),
    async install() { const response = await fetch('/late-plugin.json'); const artifact = await response.json();
      await manager.install(artifact, { acceptedIntegrity: artifact.integrity, bindings: { 'framework.presentation': 'presentation' } }); },
    async enable() { await manager.enable('late-package'); await nextTick(); },
    async disable() { await manager.disable('late-package'); await nextTick(); },
    async uninstall() { await manager.uninstall('late-package'); },
    urls: () => urls.size,
    async close() { await host.stop(); registry.close(); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; },
  } });
}

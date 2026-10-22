import { startPluginManager } from '../src/plugin-management/index.ts';
import { createCordisRuntime } from '../src/runtime-cordis/index.ts';
import { createBrowserPackageRepository, createBrowserPluginLoader, createBrowserPluginStore } from '../src/hosts/browser/plugins.ts';
import * as vue from 'vue';
import { PluginPackagePanel } from '../src/presentation-vue/management.ts';

const originalCreate = URL.createObjectURL.bind(URL); const originalRevoke = URL.revokeObjectURL.bind(URL); const urls = new Set<string>();
URL.createObjectURL = blob => { const value = originalCreate(blob); urls.add(value); return value; };
URL.revokeObjectURL = value => { urls.delete(value); originalRevoke(value); };
const manager = await startPluginManager({ runtime: createCordisRuntime(), environment: { platform: 'browser', capabilities: [] },
  store: createBrowserPluginStore('npm-demo-v1'), loader: createBrowserPluginLoader(), packages: createBrowserPackageRepository({ shared: { vue } }) });
Object.assign(window, { npmHarness: { manager, urls: () => urls.size,
  install: async () => { const data = await (await fetch('./package.json')).json(); await manager.installPackage(data, { acceptTrustedCode: true }); },
} });
const target = document.querySelector('#manager');
if (target) { const app = vue.createApp(PluginPackagePanel, { manager }); app.mount(target); }
document.documentElement.dataset.ready = 'true';

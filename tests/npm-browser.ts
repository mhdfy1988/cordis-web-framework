import { startPluginManager, packageDigest } from '../src/plugin-management/index.ts';
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
  async checkFailedPreparation() {
    for (const action of ['disable', 'uninstall'] as const) {
      const data = await (await fetch('./package.json')).json();
      const { integrity: _old, ...body } = data;
      body.name = 'npm-invalid-config'; body.declaration.manifest.id = 'npm-invalid-config';
      body.code = 'export default manifest => ({manifest,prepare:()=>({ok:false,issues:[]})})';
      await manager.installPackage({ ...body, integrity: await packageDigest(body) }, { acceptTrustedCode: true });
      let failed = false;
      try { await manager.enable('npm-invalid-config'); } catch { failed = true; }
      if (!failed || urls.size === 0) throw new Error('须先复现加载了真实资源但配置校验失败');
      await manager[action]('npm-invalid-config');
      if (urls.size !== 0) throw new Error(`${action} 后仍有原生对象 URL`);
      if (action === 'disable') await manager.uninstall('npm-invalid-config');
    }
  },
} });
const target = document.querySelector('#manager');
if (target) { const app = vue.createApp(PluginPackagePanel, { manager }); app.mount(target); }
document.documentElement.dataset.ready = 'true';

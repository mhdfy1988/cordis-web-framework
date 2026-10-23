import { createBrowserPluginStore } from '../src/hosts/browser/plugin-store.ts';
import { createBrowserPluginLoader } from '../src/hosts/browser/plugin-loader.ts';
import { createCordisRuntime } from '../src/runtime-cordis/index.ts';
import { startPluginManager, artifactIntegrity } from '../src/plugin-management/index.ts';

const name = new URL(location.href).searchParams.get('library')!;
const store = createBrowserPluginStore(name);
const output = document.createElement('pre'); output.id = 'shared-state'; document.body.append(output);
let applied = '';
let releases = 0;
const manager = await startPluginManager({ runtime: createCordisRuntime(), store, loader: createBrowserPluginLoader(),
  environment: { platform: 'browser', capabilities: [] }, builtins: [{
    config: { label: 'initial' },
    plugin: { manifest: { id: 'sample', version: '1.0.0', apiVersion: '^1', requires: [], provides: [] },
      prepare(config) {
        const label = (config as { label: string }).label;
        return { ok: true, value(scope) {
          applied = label;
          scope.onDispose(() => { releases++; applied = ''; });
          if (label === 'activation-fault') throw new Error('activation-fault');
        } };
      } },
  }] });
function snapshot() { return { ...manager.inspect(), applied, releases, config: manager.configuration('sample').config }; }
manager.subscribe(() => { output.textContent = JSON.stringify(snapshot()); });
output.textContent = JSON.stringify(snapshot());
Object.assign(window, { sharedHarness: {
  snapshot,
  enable: () => manager.enable('sample'), disable: () => manager.disable('sample'),
  configure: (label: string, revision: number) => manager.configure('sample', { config: { label }, bindings: {}, restart: true, expectedRevision: revision }),
  refresh: () => manager.refresh(), close: () => manager.close(),
  async install() {
    const content = { formatVersion: 1 as const,
      manifest: { id: 'dynamic', version: '1.0.0', apiVersion: '^1', requires: [], provides: [] },
      entries: { browser: 'export default manifest => ({ manifest, prepare: () => ({ ok: true, value() {} }) })' }, assets: [] };
    const artifact = { ...content, integrity: await artifactIntegrity(content) };
    return manager.install(artifact, { acceptedIntegrity: artifact.integrity });
  },
  enableDynamic: () => manager.enable('dynamic'), uninstallDynamic: () => manager.uninstall('dynamic'),
  async staleWrite(revision: number) {
    const raw = await store.read() as import('../src/contracts/management.ts').InstallationDocument;
    return store.write(revision, { ...raw, revision: revision + 1 });
  },
} });
document.documentElement.dataset.shared = 'ready';

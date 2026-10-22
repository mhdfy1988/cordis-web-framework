import { z } from 'zod';
import { service } from 'cordis-web-framework';
import { definePlugin } from 'cordis-web-framework/composition';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { startVueHost } from 'cordis-web-framework/presentation-vue';
import { createJsonClient } from 'cordis-web-framework/http-json';
import { createEditorSession, type EditorSession, type RecordClient } from './editor-session.ts';
import { RecordsPage } from './RecordsPage.ts';

/** 凭据、草稿与插件目录属于实例；返回宿主句柄供嵌入方显式停止。 */
export function startRecordsBrowser(options: { target: Element; baseUrl: string; onError: (error: unknown) => void }) {
  const clientKey = service<RecordClient>('records.browser-client');
  const empty = zodConfig(z.strictObject({}).default({}));
  let token: string | undefined;
  let session: EditorSession | undefined;
  const client = definePlugin({ manifest: { id: 'records.client', version: '1.0.0', apiVersion: '^1', requires: [],
    provides: [{ id: clientKey.id, version: '1.0.0' }], host: { platforms: ['browser'], capabilities: ['fetch', 'crypto'] } },
    config: empty, setup(scope) {
      scope.provide(clientKey, createJsonClient({ baseUrl: options.baseUrl, credential: () => token }));
      scope.onDispose(() => { token = undefined; });
    } });
  const editor = definePlugin({ manifest: { id: 'records.editor', version: '1.0.0', apiVersion: '^1',
    requires: [{ id: clientKey.id, range: '^1' }], provides: [] }, config: empty, setup(scope) {
      session = createEditorSession(scope.get(clientKey), value => { token = value; });
      const owned = session; scope.onDispose(() => { owned.dispose(); session = undefined; });
    } });
  return startVueHost({ target: options.target, document: { formatVersion: 1,
    plugins: [client, editor].map(module => ({ id: module.manifest.id, version: '1.0.0', entry: module.manifest.id })),
    bindings: { [clientKey.id]: 'records.client' } }, catalog: new Map([[client.manifest.id, client], [editor.manifest.id, editor]]),
    createRuntime: createCordisRuntime, component: RecordsPage, props: () => ({ session }), onError: options.onError });
}

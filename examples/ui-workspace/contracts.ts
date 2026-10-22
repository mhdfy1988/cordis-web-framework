import { service, type PluginDefinition, type ServiceKey } from 'cordis-web-framework';
import { definePlugin } from 'cordis-web-framework/composition';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import type { UiRegistry } from 'cordis-web-framework/ui';
import type { CommandRegistry } from 'cordis-web-framework/commands';
import type { VueNavigation } from 'cordis-web-framework/presentation-vue/routing';
import type { EditorSession } from '../records/browser/editor-session.ts';
import { z } from 'zod';

export const uiKey = service<UiRegistry>('workspace.ui');
export const commandsKey = service<CommandRegistry>('workspace.commands');
export const navigationKey = service<VueNavigation>('workspace.navigation');
export const editorKey = service<EditorSession>('workspace.editor');
export const sessionId = 'record-editor';
const empty = zodConfig(z.strictObject({}).default({}));
/** 样例本地可信目录：启动走全量预检，动态替换仍使用同一份作用域定义。 */
export function localPlugin(id: string, requires: readonly ServiceKey[], provides: readonly ServiceKey[], setup: PluginDefinition['setup']) {
  const definition: PluginDefinition = { id, requires, provides, setup };
  const module = definePlugin({ manifest: { id, version: '1.0.0', apiVersion: '^1', requires: requires.map(key => ({ id: key.id, range: '^1' })),
    provides: provides.map(key => ({ id: key.id, version: '1.0.0' })), host: { platforms: ['browser'], capabilities: ['dom', 'fetch'] } }, config: empty, setup });
  return { definition, module };
}

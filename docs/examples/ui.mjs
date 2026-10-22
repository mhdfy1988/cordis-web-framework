import { defineComponent, h, ref } from 'vue';
import { service } from 'cordis-web-framework';
import { createUiRegistry } from 'cordis-web-framework/ui';
import { createCommandRegistry } from 'cordis-web-framework/commands';
import { createVueUi } from 'cordis-web-framework/presentation-vue/ui';
import { startVueHost } from 'cordis-web-framework/presentation-vue';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { definePlugin } from 'cordis-web-framework/composition';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { z } from 'zod';

const uiKey = service('tutorial.ui'); const commandsKey = service('tutorial.commands');
const ui = createUiRegistry(); const commands = createCommandRegistry(); const count = ref(0);
let presenter;
const Layout = defineComponent({ inheritAttrs: false, props: ['uiContext', 'uiAccess'], setup: props => () => h('main', [
  h('h1', '教程工作台'), h(presenter.Outlet, { target: 'tutorial.content', context: props.uiContext, access: props.uiAccess }),
]) });
const Page = defineComponent({ inheritAttrs: false, setup: () => () => h('section', [
  h('button', { onClick: () => { void commands.execute('tutorial.run', {}); } }, '执行命令'),
  h('p', { role: 'status' }, `已执行 ${count.value} 次`),
]) });
presenter = createVueUi({ registry: ui, views: new Map([['layout', Layout], ['page', Page]]), onError: detail => console.error(detail) });
const empty = zodConfig(z.strictObject({}).default({}));
const manifest = (id, requires, provides) => ({ id, version: '1.0.0', apiVersion: '^1', requires, provides });
const foundation = definePlugin({ manifest: manifest('foundation', [], [uiKey, commandsKey].map(key => ({ id: key.id, version: '1.0.0' }))), config: empty,
  setup(scope) { scope.onDispose(() => ui.close()); scope.onDispose(() => commands.close()); scope.provide(uiKey, ui); scope.provide(commandsKey, commands); } });
const layout = definePlugin({ manifest: manifest('layout', [{ id: uiKey.id, range: '^1' }], []), config: empty,
  setup(scope) { const lease = scope.get(uiKey).register({ id: 'layout', target: 'root', range: '^1', renderer: 'vue', view: 'layout',
    children: [{ name: 'tutorial.content', version: '1.0.0', kind: 'list', scope: 'root' }] }); scope.onDispose(() => lease.dispose()); } });
const page = definePlugin({ manifest: manifest('page', [uiKey, commandsKey].map(key => ({ id: key.id, range: '^1' })), []), config: empty,
  setup(scope) {
    const registry = scope.get(uiKey);
    scope.onDispose(registry.inject('tutorial.content', () => registry.registerDynamic({ id: 'page', target: 'tutorial.content', range: '^1', renderer: 'vue', view: 'page' }).dispose));
    scope.onDispose(scope.get(commandsKey).register({ id: 'tutorial.run', label: '执行命令', run(_context, signal) { signal.throwIfAborted(); count.value++; } }));
  } });
const modules = [foundation, layout, page];
const host = await startVueHost({ target: document.querySelector('#app'), component: presenter.Root, createRuntime: createCordisRuntime,
  document: { formatVersion: 1, plugins: modules.map(plugin => ({ id: plugin.manifest.id, version: '1.0.0', entry: plugin.manifest.id })),
    bindings: { [uiKey.id]: 'foundation', [commandsKey.id]: 'foundation' } },
  catalog: new Map(modules.map(plugin => [plugin.manifest.id, plugin])), onError: error => console.error(error) });
document.querySelector('#stop').addEventListener('click', async event => {
  event.currentTarget.disabled = true;
  const result = await host.stop(); document.querySelector('#status').textContent = result.state === 'stopped' ? '已停止' : `关闭状态：${result.state}`;
}, { once: true });

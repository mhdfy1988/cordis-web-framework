import { commandsKey, editorKey, localPlugin, navigationKey, sessionId, uiKey } from './contracts.ts';

export function recordsFeature() {
  return localPlugin('workspace.records', [uiKey, commandsKey, navigationKey, editorKey], [], scope => {
    const ui = scope.get(uiKey); const navigation = scope.get(navigationKey); const editor = scope.get(editorKey);
    scope.onDispose(navigation.register({ id: 'records', path: '/', view: 'records.editor' }));
    scope.onDispose(navigation.registerNavigation({ id: 'records', label: '记录', routeId: 'records', order: 0 }));
    scope.onDispose(ui.inject('workspace.nav', () => ui.registerDynamic({ id: 'navigation', target: 'workspace.nav',
      range: '^1', renderer: 'vue', view: 'navigation' }).dispose));
    scope.onDispose(scope.get(commandsKey).register({ id: 'records.save', label: '保存', shortcut: { key: 's', mod: true, allowInput: true },
      enabled: context => context.sessionId === sessionId && editor.dirty() && !editor.inspect().busy && !editor.inspect().uncertain,
      async run(_context, signal) { const abort = () => editor.cancel(); signal.addEventListener('abort', abort, { once: true });
        try { await editor.save(); } finally { signal.removeEventListener('abort', abort); } },
    }));
  });
}
export function helpFeature() {
  return localPlugin('workspace.help', [navigationKey, commandsKey], [], scope => {
    const navigation = scope.get(navigationKey);
    scope.onDispose(navigation.register({ id: 'help', path: '/help', view: 'help' }));
    scope.onDispose(navigation.registerNavigation({ id: 'help', label: '帮助', routeId: 'help', order: 1 }));
    scope.onDispose(scope.get(commandsKey).register({ id: 'workspace.help', label: '打开帮助', shortcut: { key: 'h', mod: true }, run: () => navigation.navigate('help') }));
  });
}

import { defineComponent, h, shallowRef, onScopeDispose } from 'vue';
import type { EditorSession } from '../records/browser/editor-session.ts';
import { RecordEditor } from '../records/browser/RecordEditor.ts';
import { RecordList } from '../records/browser/RecordList.ts';
import type { CommandRegistry } from 'cordis-web-framework/commands';
import { sessionId } from './contracts.ts';

/** 沿用 W3 的会话和表单；仅把保存入口映射到命令，不复制保存／冲突规则。 */
export function recordView(editor: () => EditorSession, commands: CommandRegistry) {
  return defineComponent({ inheritAttrs: false, setup() {
    const session = editor(); const state = shallowRef(session.inspect());
    onScopeDispose(session.subscribe(value => { state.value = value; }));
    const discard = () => !session.dirty() || window.confirm('放弃当前未保存草稿？');
    return () => h('div', { class: 'record-view' }, [
      h('div', { class: 'identity', role: 'group', 'aria-label': '演示身份' }, (['editor', 'viewer'] as const).map(mode => h('button', {
        'aria-pressed': state.value.mode === mode, disabled: !!state.value.busy || state.value.uncertain,
        onClick: () => { if (discard()) void session.identify(mode); },
      }, mode === 'editor' ? '编辑者' : '只读者'))),
      h('div', { class: 'workspace' }, [h(RecordList, { records: state.value.records, selectedId: state.value.selectedId,
        disabled: !!state.value.busy || state.value.uncertain, onSelect: (id: string) => { if (discard()) session.select(id); } }),
      h(RecordEditor, { state: state.value, dirty: session.dirty(), onEdit: session.edit,
        onSave: () => { void commands.execute('records.save', { sessionId }); }, onCancel: session.cancel, onCheck: () => { void session.checkServer(); } }),
      ]),
    ]);
  } });
}

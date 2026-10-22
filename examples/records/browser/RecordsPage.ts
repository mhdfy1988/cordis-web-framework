import { defineComponent, h, shallowRef, onScopeDispose, type PropType } from 'vue';
import type { EditorSession } from './editor-session.ts';
import { RecordList } from './RecordList.ts';
import { RecordEditor } from './RecordEditor.ts';

export const RecordsPage = defineComponent({
  props: { session: { type: Object as PropType<EditorSession>, required: true } },
  setup(props) {
    const state = shallowRef(props.session.inspect());
    onScopeDispose(props.session.subscribe(value => { state.value = value; }));
    const allowDiscard = () => !props.session.dirty() || window.confirm('放弃当前未保存草稿？');
    return () => h('main', { class: 'records-page' }, [
      h('header', [h('div', [h('h1', '记录编辑'), h('span', { class: 'demo-label' }, '本地验收样例 · 非正式登录')]),
        h('div', { class: 'identity', role: 'group', 'aria-label': '演示身份' }, (['editor', 'viewer'] as const).map(mode => h('button', {
          type: 'button', 'aria-pressed': state.value.mode === mode, disabled: !!state.value.busy || state.value.uncertain,
          onClick: () => { if (allowDiscard()) void props.session.identify(mode); },
        }, mode === 'editor' ? '编辑者' : '只读者'))),
      ]),
      h('div', { class: 'workspace' }, [h(RecordList, { records: state.value.records, selectedId: state.value.selectedId,
        disabled: !!state.value.busy || state.value.uncertain, onSelect: (id: string) => { if (allowDiscard()) props.session.select(id); } }),
      h(RecordEditor, { state: state.value, dirty: props.session.dirty(), onEdit: props.session.edit,
        onSave: () => { void props.session.save(); }, onCancel: props.session.cancel, onCheck: () => { void props.session.checkServer(); } }),
      ]),
    ]);
  },
});

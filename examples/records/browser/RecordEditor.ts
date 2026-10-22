import { defineComponent, h, type PropType } from 'vue';
import type { EditorState } from './editor-session.ts';

export const RecordEditor = defineComponent({
  props: { state: { type: Object as PropType<EditorState>, required: true }, dirty: Boolean },
  emits: { edit: (_field: 'title' | 'body', _value: string) => true, save: () => true, cancel: () => true, check: () => true },
  setup(props, { emit }) {
    const titleId = `record-title-${crypto.randomUUID()}`;
    const bodyId = `record-body-${crypto.randomUUID()}`;
    return () => {
      const state = props.state;
      const record = state.records.find(item => item.id === state.selectedId);
      const editable = !!record?.canEdit && !state.busy;
      return h('section', { class: 'record-editor', 'aria-label': '记录编辑' }, [
        h('div', { class: 'editor-heading' }, [h('h2', '编辑记录'), record ? h('span', { class: 'muted' }, `修订 ${record.revision}`) : null]),
        h('form', { onSubmit(event: Event) { event.preventDefault(); emit('save'); } }, [
          h('label', { for: titleId }, '标题'), h('input', { id: titleId, required: true, maxlength: 100,
            value: state.draft.title, disabled: !editable, onInput: (event: Event) => emit('edit', 'title', (event.target as HTMLInputElement).value) }),
          h('label', { for: bodyId }, '内容'), h('textarea', { id: bodyId, maxlength: 4000, rows: 10,
            value: state.draft.body, disabled: !editable, onInput: (event: Event) => emit('edit', 'body', (event.target as HTMLTextAreaElement).value) }),
          h('div', { class: 'editor-actions' }, [h('button', { class: 'primary', type: 'submit', disabled: !editable || !props.dirty || state.uncertain }, state.busy === 'saving' ? '保存中…' : '保存'),
            state.busy ? h('button', { type: 'button', onClick: () => emit('cancel') }, '停止等待') :
              h('button', { type: 'button', disabled: !state.mode, onClick: () => emit('check') }, '核对服务器'),
          ]),
          h('p', { role: 'status', class: ['task-status', state.error ? 'error' : ''], 'aria-live': 'polite' }, state.status),
        ]),
      ]);
    };
  },
});

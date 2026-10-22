import { defineComponent, h, type PropType } from 'vue';
import type { RecordView } from '../shared/protocol.ts';

export const RecordList = defineComponent({
  props: { records: { type: Array as PropType<readonly RecordView[]>, required: true }, selectedId: String, disabled: Boolean },
  emits: { select: (_id: string) => true },
  setup(props, { emit }) {
    return () => h('aside', { class: 'record-list', 'aria-label': '记录列表' }, [h('h2', '记录'),
      props.records.length ? h('ul', props.records.map(record => h('li', { key: record.id }, [
        h('button', { type: 'button', 'aria-pressed': record.id === props.selectedId, disabled: props.disabled,
          onClick: () => emit('select', record.id) }, [h('span', record.title), h('small', `修订 ${record.revision}`)]),
      ]))) : h('p', { class: 'muted' }, '选择演示身份后读取记录'),
    ]);
  },
});

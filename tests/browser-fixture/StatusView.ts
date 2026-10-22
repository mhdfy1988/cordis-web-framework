import { defineComponent, h, onScopeDispose, shallowRef, type PropType } from 'vue';
import type { HostRuntimeView } from 'cordis-web-framework/contracts/host';

export const StatusView = defineComponent({
  props: { runtime: { type: Object as PropType<HostRuntimeView>, required: true } },
  setup(props) {
    const snapshot = shallowRef(props.runtime.inspect());
    onScopeDispose(props.runtime.subscribe(value => { snapshot.value = value; }));
    const clicks = shallowRef(0);
    return () => h('div', { class: 'presenter' }, [
      h('span', { class: 'plugin' }, `插件：${snapshot.value.plugins[0]?.state ?? '空'}`),
      h('button', { onClick: () => { clicks.value++; } }, `计数 ${clicks.value}`),
    ]);
  },
});

import { defineComponent, h, type PropType } from 'vue';
import type { ImageAsset } from './image-session.ts';
export const PreviewPanel = defineComponent({
  props: { title: { type: String, required: true }, asset: Object as PropType<ImageAsset>, empty: String },
  setup(props) { return () => h('section', { class: 'png-preview', 'aria-label': props.title }, [
    h('header', [h('h2', props.title), props.asset ? h('span', `${props.asset.width} × ${props.asset.height}`) : null]),
    props.asset ? [h('div', { class: 'png-preview-image' }, h('img', { src: props.asset.url, alt: `${props.title}预览` })),
      h('p', { class: 'png-filename', title: props.asset.name }, props.asset.name)]
      : h('div', { class: 'png-empty' }, props.empty),
  ]); },
});

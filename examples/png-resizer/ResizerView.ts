import { defineComponent, h, onScopeDispose, shallowRef } from 'vue';
import type { CommandRegistry } from 'cordis-web-framework/commands';
import type { ImageSession } from './image-session.ts';
import { PreviewPanel } from './PreviewPanel.ts';

export function resizerView(session: () => ImageSession, commands: CommandRegistry) {
  return defineComponent({ inheritAttrs: false, setup() {
    const model = session(); const state = shallowRef(model.inspect()); const widthId = `png-width-${crypto.randomUUID()}`;
    onScopeDispose(model.subscribe(value => { state.value = value; }));
    return () => {
      const value = state.value; const busy = value.phase === 'importing' || value.phase === 'processing'; const size = model.targetSize();
      return h('main', { class: 'png-tool' }, [
        h('header', { class: 'png-heading' }, [h('h1', 'PNG 缩放器'), h('label', { class: 'png-import' }, ['导入 PNG',
          h('input', { type: 'file', accept: 'image/png', 'aria-label': '导入 PNG', onChange(event: Event) {
            const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
            if (file) void model.importFile(file, file.name);
          } }),
        ])]),
        h('div', { class: 'png-previews' }, [h(PreviewPanel, { title: '原图', asset: value.source, empty: '选择本地 PNG，文件不会上传' }),
          h(PreviewPanel, { title: '已完成的结果', asset: value.result, empty: '设置宽度后开始缩放' })]),
        h('form', { class: 'png-controls', onSubmit(event: Event) { event.preventDefault(); void commands.execute('image.resize', {}); } }, [
          h('div', { class: 'png-size' }, [h('label', { for: widthId }, '目标宽度 / px'),
            h('input', { id: widthId, type: 'number', min: 1, max: 4096, step: 1, inputmode: 'numeric', value: value.widthInput,
              disabled: !value.source || busy, 'aria-invalid': !!value.source && !size,
              onInput: (event: Event) => model.setWidth((event.target as HTMLInputElement).value) }),
            h('span', size ? `高度 ${size.height} px · 等比` : value.source ? '输出边长 ≤4096，像素 ≤800 万' : '保持原始比例'),
          ]),
          h('div', { class: 'png-actions' }, [h('button', { type: 'submit', class: 'png-primary', disabled: !model.canProcess() }, busy ? '处理中…' : '开始缩放'),
            busy ? h('button', { type: 'button', onClick: () => { void commands.execute('image.cancel', {}); } }, '取消') : null,
            value.result ? h('a', { class: 'png-download', href: value.result.url, download: value.result.name }, '下载 PNG') : null,
          ]),
        ]),
        h('p', { role: 'status', 'aria-live': 'polite', class: ['png-status', value.error && 'png-error'] }, value.status),
      ]);
    };
  } });
}

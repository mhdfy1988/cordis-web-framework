import { defineComponent, h, shallowRef, ref, onBeforeUnmount, type PropType } from 'vue';
import type { PluginManager } from '../contracts/management.ts';

/** 可选呈现入口：只拥有文件草稿与操作反馈，安装规则和持久状态归 manager。 */
export const PluginPackagePanel = defineComponent({
  name: 'PluginPackagePanel',
  props: { manager: { type: Object as PropType<PluginManager>, required: true } },
  setup(props) {
    const snapshot = shallowRef(props.manager.inspect());
    const off = props.manager.subscribe(value => { snapshot.value = value; });
    const selected = shallowRef<unknown>(); const trusted = ref(false); let fileGeneration = 0;
    const busy = ref(false); const message = ref(''); const removing = ref(''); const phase = ref('');
    let controller: AbortController | undefined;
    onBeforeUnmount(() => { off(); controller?.abort(); });
    async function action(run: () => Promise<unknown>) {
      if (busy.value) return;
      busy.value = true; message.value = '';
      try { await run(); } catch (error) { message.value = error instanceof Error ? error.message : '操作失败'; }
      finally { busy.value = false; phase.value = ''; controller = undefined; }
    }
    async function read(event: Event) {
      const generation = ++fileGeneration;
      selected.value = undefined; trusted.value = false; message.value = '';
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        if (file.size > 8_388_608) throw new Error('浏览器插件包超过 8 MiB');
        const value = JSON.parse(await file.text()); if (generation === fileGeneration) selected.value = value;
      } catch { if (generation === fileGeneration) message.value = '无法读取包，请选择有效的浏览器交付 JSON 文件'; }
    }
    const labels: Record<string, string> = { ready: '运行中', waiting: '等待依赖', loading: '启动中', failed: '启动失败',
      'cleanup-failed': '清理失败', stopped: '已停止', 'not-loaded': '未装载', stopping: '停止中' };
    return () => h('section', { class: 'cw-package-panel', 'aria-label': '独立插件包' }, [
      h('style', styles), h('header', [h('h2', '独立插件包')]),
      h('form', { onSubmit(event: Event) { event.preventDefault(); void action(async () => {
        if (!selected.value || !trusted.value) throw new Error('请选择插件包并确认代码来源可信');
        controller = new AbortController();
        await props.manager.installPackage(selected.value, { acceptTrustedCode: true, signal: controller.signal,
          onProgress(value) { phase.value = value === 'installing' ? '正在安装' : value === 'validating' ? '正在校验' : '正在保存'; } });
        message.value = '已安装，尚未启用'; selected.value = undefined; trusted.value = false;
      }); } }, [
        h('label', { class: 'cw-package-file' }, [h('span', '浏览器插件包'), h('input', { type: 'file', accept: '.json,application/json', disabled: busy.value, onChange: read })]),
        h('label', { class: 'cw-package-trust' }, [h('input', { type: 'checkbox', checked: trusted.value, disabled: busy.value,
          onChange: (event: Event) => { trusted.value = (event.target as HTMLInputElement).checked; } }), '确认来源可信，允许在本页面执行代码']),
        h('div', { class: 'cw-package-actions' }, [h('button', { type: 'submit', disabled: busy.value || !selected.value || !trusted.value }, busy.value ? phase.value || '处理中…' : '安装插件'),
          busy.value && controller ? h('button', { type: 'button', onClick: () => controller?.abort() }, '取消安装') : null]),
      ]),
      message.value ? h('p', { role: 'status', class: 'cw-package-feedback' }, message.value) : null,
      h('div', { class: 'cw-package-list' }, snapshot.value.plugins.filter(item => !item.builtin).map(item => h('article', { key: item.id, 'data-package': item.id }, [
        h('div', { class: 'cw-package-identity' }, [h('strong', item.package?.name ?? item.id), h('small', `${item.version} · ${item.package?.source ?? 'JSON 插件包'}`)]),
        h('div', { class: 'cw-package-state' }, [h('span', item.enabled ? '已启用' : '已停用'), h('small', labels[item.state] ?? item.state)]),
        h('div', { class: 'cw-package-actions' }, [h('button', { disabled: busy.value,
          onClick: () => action(() => item.enabled ? props.manager.disable(item.id) : props.manager.enable(item.id)) }, item.enabled ? '停用' : '启用'),
          h('button', { disabled: busy.value, onClick: () => { removing.value = item.id; } }, '卸载')]),
        removing.value === item.id ? h('div', { class: 'cw-package-confirm', role: 'group', 'aria-label': '确认卸载' }, [
          h('span', `卸载 ${item.package?.name ?? item.id}？应用用户数据将保留。`),
          h('button', { disabled: busy.value, onClick: () => action(async () => { await props.manager.uninstall(item.id); removing.value = ''; }) }, '确认卸载'),
          h('button', { disabled: busy.value, onClick: () => { removing.value = ''; } }, '取消'),
        ]) : null,
      ]))),
      snapshot.value.plugins.every(item => item.builtin) ? h('p', { class: 'cw-package-empty' }, '尚未安装独立插件包') : null,
    ]);
  },
});

const styles = `
.cw-package-panel{font:14px/1.6 system-ui,sans-serif;color:var(--cw-text,#253043);border:1px solid var(--cw-border,#dce1e8);border-radius:10px;padding:24px;background:var(--cw-surface,var(--cw-background,#fff))}
.cw-package-panel h2{font-size:20px;margin:0 0 20px}.cw-package-panel form{display:grid;gap:14px}.cw-package-file{display:grid;gap:6px}.cw-package-file input{max-width:100%;font:inherit}
.cw-package-trust{display:flex;align-items:flex-start;gap:8px}.cw-package-trust input{margin-top:5px}.cw-package-actions{display:flex;gap:8px;flex-wrap:wrap}
.cw-package-panel button{font:inherit;border:1px solid var(--cw-border,#cbd3df);border-radius:6px;padding:7px 14px;background:var(--cw-surface,var(--cw-background,#fff));color:inherit;cursor:pointer}
.cw-package-panel button:hover:not(:disabled){background:var(--cw-hover,var(--cw-panel,#eef3fa))}.cw-package-panel button:focus-visible,.cw-package-panel input:focus-visible{outline:2px solid var(--cw-accent,#2563eb);outline-offset:3px}.cw-package-panel button:disabled{opacity:.5;cursor:default}
.cw-package-feedback{padding:10px 0;overflow-wrap:anywhere}.cw-package-list article{display:flex;gap:20px;align-items:center;flex-wrap:wrap;border-top:1px solid var(--cw-border,#dce1e8);padding:18px 0 0;margin-top:20px}
.cw-package-identity{flex:1;min-width:140px;overflow-wrap:anywhere}.cw-package-panel small{display:block;color:var(--cw-muted,#657185)}.cw-package-state{min-width:80px}.cw-package-empty{color:var(--cw-muted,#657185);margin-bottom:0}.cw-package-confirm{display:flex;flex-wrap:wrap;align-items:center;gap:10px;width:100%}
@media(max-width:600px){.cw-package-panel{padding:16px}.cw-package-list article{gap:12px}.cw-package-identity{flex-basis:65%}.cw-package-state{min-width:0}}
`;

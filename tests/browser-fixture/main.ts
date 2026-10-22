import { defineComponent } from 'vue';
import { startVueHost } from 'cordis-web-framework/presentation-vue';
import { startBrowserHost } from 'cordis-web-framework/hosts/browser';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import type { HostHandle } from 'cordis-web-framework/contracts/host';
import type { PluginManifest, RegisteredPlugin } from 'cordis-web-framework/contracts/composition';
import { StatusView } from './StatusView.ts';
import { runFailureCases } from './failure-cases.ts';

document.documentElement.dataset.contracts = await runFailureCases();

const badView = defineComponent({ setup() { throw new Error('测试挂载错误'); } });
for (const card of Array.from(document.querySelectorAll<HTMLElement>('.instance'))) {
  const target = card.querySelector<HTMLElement>('.target')!;
  const status = card.querySelector<HTMLElement>('[role=status]')!;
  const resources = card.querySelector<HTMLElement>('.resources')!;
  let active = 0;
  let factories = 0;
  let host: HostHandle | undefined;
  let busy = false;
  const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>('button[data-action]'));
  const update = (text: string) => {
    status.textContent = text;
    resources.textContent = `资源 ${active} · 实例创建 ${factories}`;
    for (const button of buttons) button.disabled = busy || (button.dataset.action === 'stop' ? !host : !!host);
  };
  const options = (required?: PluginManifest['host']) => {
    const module: RegisteredPlugin = { manifest: { id: 'example', version: '1.0.0', apiVersion: '^1', requires: [], provides: [], ...(required ? { host: required } : {}) },
      prepare: () => ({ ok: true, value: scope => { active++; scope.onDispose(() => { active--; }); } }) };
    return { target, document: { formatVersion: 1, plugins: [{ id: 'example', version: '1.0.0', entry: 'example' }], bindings: {} },
      catalog: new Map([['example', module]]), createRuntime() { factories++; return createCordisRuntime(); } };
  };
  for (const button of buttons) button.addEventListener('click', () => {
    void (async () => {
      busy = true; update('处理中');
      try {
        if (button.dataset.action === 'stop') {
          const report = await host!.stop();
          if (report.state === 'stopped') host = undefined;
          update(report.state === 'stopped' ? '已停止' : report.state);
        } else if (button.dataset.action === 'reject') {
          await startVueHost({ ...options({ platforms: ['node'], capabilities: ['http'] }), component: StatusView,
            props: runtime => ({ runtime }), onError: () => update('呈现错误') });
        } else if (button.dataset.action === 'failure') {
          await startVueHost({ ...options(), component: badView, onError: () => update('呈现错误') });
        } else if (button.dataset.action === 'partial') {
          await startBrowserHost({ ...options(), mount(element, _runtime, onRelease) {
            const node = document.createElement('span'); node.textContent = '部分挂载'; element.append(node);
            onRelease(() => node.remove()); throw new Error('部分挂载失败');
          } });
        } else {
          host = await startVueHost({ ...options(), component: StatusView,
            props: runtime => ({ runtime }), onError: () => update('呈现错误') });
          update(host.inspect().state === 'ready' ? '已就绪' : '未就绪');
        }
      } catch { update(button.dataset.action === 'reject' ? '能力不匹配' : '启动失败，已回收'); }
      finally { busy = false; update(status.textContent!); }
    })();
  });
  update('未启动');
}

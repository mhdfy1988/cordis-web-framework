import { startBrowserHost } from 'cordis-web-framework/hosts/browser';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';

globalThis.w2Result = (async () => {
  let active = 0;
  const module = { manifest: { id: 'browser-test', version: '1.0.0', apiVersion: '^1', requires: [], provides: [],
    host: { platforms: ['browser'], capabilities: ['dom'] } }, prepare: () => ({ ok: true, value(scope) {
    active++; scope.onDispose(() => { active--; });
  } }) };
  const target = document.createElement('main'); document.body.append(target);
  const options = { target, document: { formatVersion: 1, plugins: [{ id: 'browser-test', version: '1.0.0', entry: 'browser-test' }], bindings: {} },
    catalog: new Map([['browser-test', module]]), createRuntime: createCordisRuntime,
    mount(element, runtime, onRelease) {
      if (!runtime.audit().ready) throw new Error('运行时未就绪');
      const node = document.createElement('button'); node.textContent = '包产物宿主'; element.append(node);
      onRelease(() => node.remove());
    } };
  for (let index = 0; index < 2; index++) {
    const host = await startBrowserHost(options);
    if (active !== 1 || host.inspect().state !== 'ready' || !target.querySelector('button')) throw new Error('启动错误');
    if ((await host.stop()).state !== 'stopped' || target.childNodes.length || active) throw new Error('清理错误');
  }
  return 'W2 isolated browser host passed';
})();

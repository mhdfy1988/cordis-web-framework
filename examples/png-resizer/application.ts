import { service } from 'cordis-web-framework';
import { definePlugin } from 'cordis-web-framework/composition';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { startVueHost } from 'cordis-web-framework/presentation-vue';
import { createVueUi } from 'cordis-web-framework/presentation-vue/ui';
import { createUiRegistry } from 'cordis-web-framework/ui';
import { createCommandRegistry } from 'cordis-web-framework/commands';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { z } from 'zod';
import { createWorkerRaster } from './worker-raster.ts';
import { createImageSession, type ImageSession } from './image-session.ts';
import { resizerView } from './ResizerView.ts';

/** 同一公开入口用于独立网页和嵌入实例；图片业务没有进入框架 src。 */
export async function startImageTool(options: { target: HTMLElement; workerUrl?: URL; onError: (error: unknown) => void }) {
  const ui = createUiRegistry(); const commands = createCommandRegistry();
  const rasterKey = service<ReturnType<typeof createWorkerRaster>>('png.raster');
  const sessionKey = service<ImageSession>('png.session');
  const uiKey = service<typeof ui>('png.ui'); const commandsKey = service<typeof commands>('png.commands');
  let raster: ReturnType<typeof createWorkerRaster>; let session: ImageSession;
  const empty = zodConfig(z.strictObject({}).default({}));
  const modules = [
    definePlugin({ manifest: { id: 'png.foundation', version: '1.0.0', apiVersion: '^1', requires: [],
      provides: [uiKey, commandsKey].map(key => ({ id: key.id, version: '1.0.0' })) }, config: empty, setup(scope) {
      scope.provide(uiKey, ui); scope.provide(commandsKey, commands); scope.onDispose(() => ui.close()); scope.onDispose(() => commands.close());
    } }),
    definePlugin({ manifest: { id: 'png.raster', version: '1.0.0', apiVersion: '^1', requires: [], provides: [{ id: rasterKey.id, version: '1.0.0' }],
      host: { platforms: ['browser'], capabilities: ['dom'] } }, config: empty, setup(scope) {
      raster = createWorkerRaster(options.workerUrl ?? new URL('./raster-worker.js', import.meta.url));
      scope.provide(rasterKey, raster); scope.onDispose(() => raster.close());
    } }),
    definePlugin({ manifest: { id: 'png.session', version: '1.0.0', apiVersion: '^1', requires: [{ id: rasterKey.id, range: '^1' }],
      provides: [{ id: sessionKey.id, version: '1.0.0' }] }, config: empty, setup(scope) {
      session = createImageSession(scope.get(rasterKey), { create: blob => URL.createObjectURL(blob), revoke: url => URL.revokeObjectURL(url) });
      scope.provide(sessionKey, session); scope.onDispose(() => session.close());
    } }),
    definePlugin({ manifest: { id: 'png.workspace', version: '1.0.0', apiVersion: '^1', provides: [],
      requires: [sessionKey, uiKey, commandsKey].map(key => ({ id: key.id, range: '^1' })) }, config: empty, setup(scope) {
      const model = scope.get(sessionKey); const actions = scope.get(commandsKey);
      scope.onDispose(actions.register({ id: 'image.resize', label: '开始缩放', enabled: () => model.canProcess(), run: (_context, signal) => model.resize(signal) }));
      scope.onDispose(actions.register({ id: 'image.cancel', label: '取消', enabled: () => ['importing', 'processing'].includes(model.inspect().phase), run: () => model.cancel() }));
      scope.onDispose(scope.get(uiKey).register({ id: 'png.workspace', target: 'root', range: '^1', renderer: 'vue', view: 'png.workspace' }).dispose);
    } }),
  ];
  const presenter = createVueUi({ registry: ui, views: new Map([['png.workspace', resizerView(() => session, commands)]]), onError: options.onError });
  const host = await startVueHost({ target: options.target, component: presenter.Root, onError: options.onError, createRuntime: createCordisRuntime,
    document: { formatVersion: 1, plugins: modules.map(module => ({ id: module.manifest.id, version: '1.0.0', entry: module.manifest.id })),
      bindings: { [uiKey.id]: 'png.foundation', [commandsKey.id]: 'png.foundation', [rasterKey.id]: 'png.raster', [sessionKey.id]: 'png.session' } },
    catalog: new Map(modules.map(module => [module.manifest.id, module])),
  });
  return Object.freeze({ host, session: session!, commands, ui, raster: raster! });
}

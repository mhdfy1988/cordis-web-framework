import { ImageToolError, outputName, resizedSize, type Size, type RasterProcessor } from './domain.ts';
export interface ImageAsset extends Size { readonly blob: Blob; readonly url: string; readonly name: string }
export interface ImageState {
  readonly phase: 'empty' | 'importing' | 'ready' | 'processing' | 'done' | 'closed';
  readonly source?: ImageAsset; readonly result?: ImageAsset; readonly widthInput: string;
  readonly status: string; readonly error: boolean;
}
export interface ObjectUrls { create(blob: Blob): string; revoke(url: string): void }
const errorText: Record<string, string> = {
  'invalid-file': '文件不是有效的 PNG，请重新选择', 'too-large': '图片超过 8 MiB 文件、4096 边长或 800 万像素限制',
  'invalid-width': '宽度需要是 1–4096 的整数', unsupported: '当前浏览器不能使用所需的本地图片能力',
  'processing-failed': '图片处理失败，请检查文件或重新处理', cancelled: '已取消，保留原图和上次结果',
};
/** 会话只确认仍有效的任务结果；组件不另外保存源图、草稿或输出。 */
export function createImageSession(processor: RasterProcessor, objectUrls: ObjectUrls) {
  let state: ImageState = Object.freeze({ phase: 'empty', widthInput: '', status: '选择一张 PNG 开始', error: false });
  let sequence = 0; let controller: AbortController | undefined; let closed = false; let closing: Promise<void> | undefined;
  const listeners = new Set<(state: ImageState) => void>(); const tasks = new Set<Promise<void>>(); const urls = new Set<string>();
  let observerFailures = 0;
  const publish = (changes: Partial<ImageState>) => {
    state = Object.freeze({ ...state, ...changes });
    for (const listener of [...listeners]) try { listener(state); } catch { observerFailures++; }
  };
  const release = (asset?: ImageAsset) => { if (asset && urls.delete(asset.url)) objectUrls.revoke(asset.url); };
  const asset = (blob: Blob, name: string, size: Size): ImageAsset => {
    const url = objectUrls.create(blob); urls.add(url); return Object.freeze({ blob, name, ...size, url });
  };
  const idle = () => state.result ? 'done' as const : state.source ? 'ready' as const : 'empty' as const;
  function stopCurrent() { sequence++; const previous = controller; controller = undefined; previous?.abort(); }
  function begin(phase: 'importing' | 'processing') {
    if (closed) throw new Error('图片会话已关闭');
    stopCurrent(); if (closed) throw new Error('图片会话已关闭');
    const id = sequence; const own = new AbortController(); controller = own;
    publish({ phase, status: phase === 'importing' ? '正在读取 PNG' : '正在本地缩放', error: false });
    return { signal: own.signal, current: () => !closed && sequence === id };
  }
  function track(promise: Promise<void>) { tasks.add(promise); void promise.then(() => tasks.delete(promise), () => tasks.delete(promise)); return promise; }
  function fail(error: unknown) {
    const code = error instanceof ImageToolError ? error.code : 'processing-failed';
    publish({ phase: idle(), error: code !== 'cancelled', status: errorText[code] ?? errorText['processing-failed'] });
  }
  return Object.freeze({
    inspect: () => state,
    inspectResources: () => Object.freeze({ closed, tasks: tasks.size, urls: urls.size, listeners: listeners.size, observerFailures }),
    subscribe(listener: (state: ImageState) => void) { if (closed) throw new Error('图片会话已关闭'); listeners.add(listener); listener(state); return () => { listeners.delete(listener); }; },
    setWidth(value: string) { if (closed || controller) return; publish({ widthInput: value.slice(0, 20) }); },
    targetSize(): Size | undefined { try { return state.source ? resizedSize(state.source, state.widthInput) : undefined; } catch { return undefined; } },
    canProcess() { try { if (closed || controller || !state.source) return false; resizedSize(state.source, state.widthInput); return true; } catch { return false; } },
    importFile(blob: Blob, name: string) {
      const task = begin('importing');
      return track((async () => {
        if (!task.current()) return;
        try {
          const size = await processor.inspect(blob, task.signal); if (!task.current()) return;
          if (task.signal.aborted) throw new ImageToolError('cancelled');
          const source = asset(blob, name.slice(0, 180), size); release(state.source); release(state.result);
          controller = undefined;
          publish({ source, result: undefined, widthInput: String(size.width), phase: 'ready', status: '原图已读取', error: false });
        } catch (error) { if (task.current()) { controller = undefined; fail(error); } }
      })());
    },
    resize(externalSignal?: AbortSignal) {
      if (closed || controller || !state.source) return Promise.resolve();
      const source = state.source; let size: Size;
      try { size = resizedSize(source, state.widthInput); } catch (error) { fail(error); return Promise.resolve(); }
      const task = begin('processing');
      const signal = externalSignal ? AbortSignal.any([task.signal, externalSignal]) : task.signal;
      return track((async () => {
        if (!task.current()) return;
        try {
          const output = await processor.resize(source.blob, size.width, signal); if (!task.current()) return;
          if (signal.aborted) throw new ImageToolError('cancelled');
          if (output.width !== size.width || output.height !== size.height) throw new ImageToolError('processing-failed');
          const result = asset(output.blob, outputName(source.name, size), size); release(state.result); controller = undefined;
          publish({ result, phase: 'done', status: '缩放完成', error: false });
        } catch (error) { if (task.current()) { controller = undefined; fail(error); } }
      })());
    },
    cancel() { if (closed || !controller) return; stopCurrent(); if (!closed) publish({ phase: idle(), status: errorText.cancelled, error: false }); },
    close() {
      if (closing) return closing;
      const done = Promise.withResolvers<void>(); closing = done.promise; closed = true;
      stopCurrent(); release(state.source); release(state.result);
      publish({ phase: 'closed', source: undefined, result: undefined, status: '已停止', error: false }); listeners.clear();
      void Promise.all([...tasks]).then(() => done.resolve(), done.reject); return closing;
    },
  });
}
export type ImageSession = ReturnType<typeof createImageSession>;

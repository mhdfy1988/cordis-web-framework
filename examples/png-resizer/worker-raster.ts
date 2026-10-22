import { ImageToolError, inspectPngHeader, MAX_OUTPUT_BYTES } from './domain.ts';
import { readResponse, type RasterRequest } from './protocol.ts';
/** 每次操作独占专用线程；取消只影响本任务，不发送后台网络请求。 */
export function createWorkerRaster(workerUrl: URL) {
  if (workerUrl.origin !== location.origin || !['http:', 'https:'].includes(workerUrl.protocol)) throw new ImageToolError('unsupported');
  const active = new Set<() => void>(); let sequence = 0; let closed = false;
  function run(kind: RasterRequest['kind'], file: Blob, signal: AbortSignal, width?: number) {
    if (closed || signal.aborted) return Promise.reject(new ImageToolError('cancelled'));
    return new Promise<ReturnType<typeof readResponse>>((resolve, reject) => {
      let worker: Worker;
      try { worker = new Worker(workerUrl, { type: 'module' }); } catch { reject(new ImageToolError('unsupported')); return; }
      let finished = false; let timer: ReturnType<typeof setTimeout> | undefined;
      let responding = false;
      const request: RasterRequest = { protocol: 1, id: ++sequence, kind, file, ...(width === undefined ? {} : { width }) };
      const finish = (error?: ImageToolError, value?: ReturnType<typeof readResponse>) => {
        if (finished) return; finished = true;
        clearTimeout(timer); signal.removeEventListener('abort', abort); active.delete(abort);
        worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate();
        if (error) reject(error); else resolve(value!);
      };
      const abort = () => finish(new ImageToolError('cancelled'));
      active.add(abort); signal.addEventListener('abort', abort, { once: true });
      worker.onmessage = event => { void (async () => {
        if (responding) { finish(new ImageToolError('processing-failed')); return; } responding = true;
        try {
          const result = readResponse(event.data, request);
          if (result.blob) {
            const header = await inspectPngHeader(result.blob, MAX_OUTPUT_BYTES).catch(() => { throw new ImageToolError('processing-failed'); });
            if (header.width !== result.width || header.height !== result.height) throw new ImageToolError('processing-failed');
          }
          finish(undefined, result);
        } catch (error) { finish(error instanceof ImageToolError ? error : new ImageToolError('processing-failed')); }
      })(); };
      worker.onerror = event => { event.preventDefault(); finish(new ImageToolError('processing-failed')); };
      worker.onmessageerror = () => finish(new ImageToolError('processing-failed'));
      timer = setTimeout(() => finish(new ImageToolError('processing-failed')), 15000);
      try { worker.postMessage(request); } catch { finish(new ImageToolError('processing-failed')); }
    });
  }
  return Object.freeze({
    inspect: (file: Blob, signal: AbortSignal) => run('inspect', file, signal),
    async resize(file: Blob, width: number, signal: AbortSignal) {
      const result = await run('resize', file, signal, width); return { width: result.width, height: result.height, blob: result.blob! };
    },
    inspectResources: () => Object.freeze({ closed, workers: active.size }),
    close() { if (closed) return; closed = true; for (const abort of [...active]) abort(); },
  });
}

import { ImageToolError, checkSize, inspectPngHeader, resizedSize, MAX_OUTPUT_BYTES } from './domain.ts';
import { readRequest } from './protocol.ts';

// 只描述本线程用到的原生边界，不将 Worker 类型加入框架公共契约。
const endpoint = globalThis as unknown as { onmessage: ((event: MessageEvent<unknown>) => void) | null; postMessage(message: unknown): void };
let received = false;
endpoint.onmessage = event => { void (async () => {
  let id = 0; let bitmap: ImageBitmap | undefined; let canvas: OffscreenCanvas | undefined;
  try {
    const request = readRequest(event.data); id = request.id;
    if (received) throw new ImageToolError('processing-failed'); received = true;
    const header = await inspectPngHeader(request.file);
    if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') throw new ImageToolError('unsupported');
    bitmap = await createImageBitmap(request.file); const source = checkSize(bitmap);
    if (source.width !== header.width || source.height !== header.height) throw new ImageToolError('invalid-file');
    if (request.kind === 'inspect') { endpoint.postMessage({ protocol: 1, id, ok: true, ...source }); return; }
    const output = resizedSize(source, String(request.width));
    canvas = new OffscreenCanvas(output.width, output.height); const context = canvas.getContext('2d');
    if (!context || typeof canvas.convertToBlob !== 'function') throw new ImageToolError('unsupported');
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, output.width, output.height);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    if (blob.type !== 'image/png' || blob.size > MAX_OUTPUT_BYTES) throw new ImageToolError('processing-failed');
    endpoint.postMessage({ protocol: 1, id, ok: true, ...output, blob });
  } catch (error) {
    const code = error instanceof ImageToolError && ['invalid-file', 'too-large', 'unsupported'].includes(error.code) ? error.code : 'processing-failed';
    endpoint.postMessage({ protocol: 1, id, ok: false, code });
  } finally { bitmap?.close(); if (canvas) { canvas.width = 1; canvas.height = 1; } }
})(); };

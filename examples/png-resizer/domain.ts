export interface Size { readonly width: number; readonly height: number }
export interface RasterProcessor {
  inspect(file: Blob, signal: AbortSignal): Promise<Size>;
  resize(file: Blob, width: number, signal: AbortSignal): Promise<Size & { readonly blob: Blob }>;
}
export type ImageErrorCode = 'invalid-file' | 'too-large' | 'invalid-width' | 'unsupported' | 'processing-failed' | 'cancelled';
export class ImageToolError extends Error {
  readonly code: ImageErrorCode;
  constructor(code: ImageErrorCode) { super(code); this.code = code; }
}
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
export function checkSize(size: Size): Size {
  if (!Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width < 1 || size.height < 1
    || size.width > 4096 || size.height > 4096 || size.width * size.height > 8_000_000) throw new ImageToolError('too-large');
  return Object.freeze({ width: size.width, height: size.height });
}
/** 只读固定 PNG/IHDR 头部作资源预检；完整数据有效性仍由浏览器解码器判断。 */
export async function inspectPngHeader(blob: Blob, maximumBytes = MAX_FILE_BYTES): Promise<Size> {
  if (blob.size > maximumBytes) throw new ImageToolError('too-large');
  if (blob.size < 33) throw new ImageToolError('invalid-file');
  const bytes = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
  if (signature.some((value, index) => bytes[index] !== value)) throw new ImageToolError('invalid-file');
  const view = new DataView(bytes.buffer); return checkSize({ width: view.getUint32(16), height: view.getUint32(20) });
}
export function resizedSize(source: Size, widthInput: string): Size {
  if (!/^[1-9]\d{0,3}$/.test(widthInput)) throw new ImageToolError('invalid-width');
  const width = Number(widthInput); if (width > 4096) throw new ImageToolError('invalid-width');
  return checkSize({ width, height: Math.max(1, Math.round(source.height * width / source.width)) });
}
export function outputName(name: string, size: Size) {
  const base = name.replace(/\.png$/i, '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 80) || 'image';
  return `${base}-${size.width}x${size.height}.png`;
}

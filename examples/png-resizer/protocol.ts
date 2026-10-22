import { z } from 'zod';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { ImageToolError, MAX_OUTPUT_BYTES, checkSize, type Size } from './domain.ts';
const id = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const size = { width: z.number().int().min(1).max(4096), height: z.number().int().min(1).max(4096) };
const requestSchema = zodConfig(z.discriminatedUnion('kind', [
  z.strictObject({ protocol: z.literal(1), id, kind: z.literal('inspect') }),
  z.strictObject({ protocol: z.literal(1), id, kind: z.literal('resize'), width: size.width }),
]));
const responseSchema = zodConfig(z.discriminatedUnion('ok', [
  z.strictObject({ protocol: z.literal(1), id, ok: z.literal(true), ...size }),
  z.strictObject({ protocol: z.literal(1), id, ok: z.literal(false), code: z.enum(['invalid-file', 'too-large', 'unsupported', 'processing-failed']) }),
]));
export interface RasterRequest { readonly protocol: 1; readonly id: number; readonly kind: 'inspect' | 'resize'; readonly file: Blob; readonly width?: number }
export interface RasterResult extends Size { readonly blob?: Blob }
export function readRequest(input: unknown): RasterRequest {
  if (!input || typeof input !== 'object') throw new ImageToolError('invalid-file');
  const { file, ...metadata } = input as Record<string, unknown>; const parsed = requestSchema.validate(metadata);
  if (!parsed.ok || !(file instanceof Blob)) throw new ImageToolError('invalid-file');
  return { ...parsed.value, file };
}
export function readResponse(input: unknown, request: RasterRequest): RasterResult {
  if (!input || typeof input !== 'object') throw new ImageToolError('processing-failed');
  const { blob, ...metadata } = input as Record<string, unknown>; const parsed = responseSchema.validate(metadata);
  if (!parsed.ok || parsed.value.id !== request.id) throw new ImageToolError('processing-failed');
  if (!parsed.value.ok) throw new ImageToolError(parsed.value.code);
  const result = checkSize(parsed.value);
  if (request.kind === 'resize' && (!(blob instanceof Blob) || blob.type !== 'image/png' || !blob.size || blob.size > MAX_OUTPUT_BYTES || result.width !== request.width)) throw new ImageToolError('processing-failed');
  if (request.kind === 'inspect' && blob !== undefined) throw new ImageToolError('processing-failed');
  return { ...result, ...(blob instanceof Blob ? { blob } : {}) };
}

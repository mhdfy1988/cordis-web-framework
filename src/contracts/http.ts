import type { ConfigValidator } from './composition.ts';
import type { Logger } from './logging.ts';

export const JSON_PROTOCOL_VERSION = '1';
export const JSON_BYTE_LIMIT = 65_536;
export type ApiErrorCode = 'invalid-input' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict'
  | 'protocol-incompatible' | 'payload-too-large' | 'unsupported-media' | 'cancelled' | 'unavailable' | 'internal-error';
export interface ApiRequestContext {
  readonly requestId: string;
  readonly credential?: string;
  readonly signal: AbortSignal;
  readonly logger: Logger;
}
export interface JsonOperation<I, O> {
  readonly method: 'GET' | 'POST' | 'PUT';
  readonly path: string;
  readonly input: ConfigValidator<I>;
  readonly output: ConfigValidator<O>;
}
export interface JsonEndpoint {
  readonly method: JsonOperation<unknown, unknown>['method'];
  readonly path: string;
  execute(context: ApiRequestContext, body: unknown): Promise<unknown>;
}
export type ApiEnvelope = { readonly protocol: '1'; readonly requestId: string; readonly ok: true; readonly data: unknown }
  | { readonly protocol: '1'; readonly requestId: string; readonly ok: false; readonly error: { readonly code: ApiErrorCode } };
export interface StaticAsset {
  readonly path: string;
  readonly contentType: 'text/html; charset=utf-8' | 'text/javascript; charset=utf-8' | 'text/css; charset=utf-8';
  readonly content: string;
}

import { z } from 'zod';
import type { ConfigValidator, ValidationIssue, ValidationResult } from '../contracts/composition.ts';
import type { ApiEnvelope } from '../contracts/http.ts';

const issueList = (issues: readonly { path: readonly PropertyKey[]; message: string }[]): readonly ValidationIssue[] =>
  Object.freeze(issues.map(issue => Object.freeze({
    path: Object.freeze(issue.path.map(key => typeof key === 'symbol' ? String(key) : key)), message: issue.message,
  })));

/** 第三方校验错误只在适配内部使用；配置输入输出都限制为 JSON 数据。 */
export function zodConfig<T>(schema: z.ZodType<T>): ConfigValidator<T> {
  return Object.freeze({ validate(input: unknown): ValidationResult<T> {
    try {
      const parsed = schema.safeParse(input);
      if (!parsed.success) return { ok: false, issues: issueList(parsed.error.issues) };
      const json = z.json().safeParse(parsed.data);
      if (!json.success) return { ok: false, issues: issueList(json.error.issues) };
      return { ok: true, value: json.data as T };
    } catch (error) {
      return { ok: false, issues: Object.freeze([Object.freeze({ path: Object.freeze([]),
        message: error instanceof Error ? error.message : String(error) })]) };
    }
  } });
}

const identifier = z.string().min(1).max(200).refine(value => value.trim() === value, '标识不能含首尾空白');
const versionText = z.string().min(1).max(256);
const uiPositionSchema = z.strictObject({ name: identifier, kind: z.enum(['single', 'list', 'keyed', 'chain']),
  scope: z.enum(['root', 'session-maybe', 'session']), version: versionText });
export const uiPositionValidator = zodConfig(uiPositionSchema);
export const uiContributionValidator = zodConfig(z.strictObject({ id: identifier, target: identifier, range: versionText,
  renderer: identifier, view: identifier, key: identifier.optional(), priority: z.number().int().min(-10000).max(10000).optional(),
  order: z.number().int().min(-10000).max(10000).optional(), children: z.array(uiPositionSchema).max(64).optional(),
}));
export const uiRouteValidator = zodConfig(z.strictObject({ id: identifier, view: identifier,
  path: z.string().max(256).regex(/^\/(?:[a-zA-Z0-9_-]+\/?)*$/),
}));
export const uiNavigationValidator = zodConfig(z.strictObject({ id: identifier, label: identifier, routeId: identifier,
  order: z.number().int().min(-10000).max(10000).optional(),
}));
export const uiThemeValidator = zodConfig(z.strictObject({ id: identifier,
  tokens: z.record(z.string().regex(/^--cw-[a-z][a-z0-9-]*$/), z.string().min(1).max(128).regex(/^[#\w\s.,()%+-]+$/)),
}));
export const jsonObjectValidator = zodConfig(z.record(z.string(), z.json()));
const apiErrorCode = z.enum(['invalid-input', 'unauthenticated', 'forbidden', 'not-found', 'conflict',
  'protocol-incompatible', 'payload-too-large', 'unsupported-media', 'cancelled', 'unavailable', 'internal-error']);
export const apiEnvelopeValidator: ConfigValidator<ApiEnvelope> = zodConfig(z.discriminatedUnion('ok', [
  z.strictObject({ protocol: z.literal('1'), requestId: z.uuid(), ok: z.literal(true), data: z.json() }),
  z.strictObject({ protocol: z.literal('1'), requestId: z.uuid(), ok: z.literal(false), error: z.strictObject({ code: apiErrorCode }) }),
]));
export const configurationSourcesValidator = zodConfig(z.array(z.strictObject({
  id: identifier,
  kind: z.enum(['defaults', 'file', 'environment', 'override']),
  values: z.record(z.string().refine(key => !['__proto__', 'constructor', 'prototype'].includes(key),
    '不允许特殊原型字段'), z.json()),
})).max(64));
export const manifestValidator = zodConfig(z.strictObject({
  id: identifier, version: versionText, apiVersion: versionText,
  requires: z.array(z.strictObject({ id: identifier, range: versionText })).max(256),
  provides: z.array(z.strictObject({ id: identifier, version: versionText })).max(256),
  host: z.strictObject({ platforms: z.array(z.enum(['browser', 'node'])).min(1).max(2),
    capabilities: z.array(identifier).max(64) }).optional(),
}));
export const hostEnvironmentValidator = zodConfig(z.strictObject({
  platform: z.enum(['browser', 'node']), capabilities: z.array(identifier).max(64),
}));
export const hostReadinessValidator = zodConfig(z.array(identifier).max(1000).refine(value => new Set(value).size === value.length, '必需插件不能重复'));
export const nodeListenerValidator = zodConfig(z.strictObject({
  hostname: z.string().min(1).max(253).default('127.0.0.1'),
  port: z.number().int().min(0).max(65535).default(0),
}));
export const documentValidator = zodConfig(z.strictObject({
  formatVersion: z.literal(1),
  plugins: z.array(z.strictObject({ id: identifier, version: versionText, entry: identifier,
    config: z.json().optional() })).max(1000),
  bindings: z.record(identifier, identifier),
}));

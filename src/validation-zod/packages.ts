import { z } from 'zod';
import { manifestValidator } from './index.ts';

const manifest = z.unknown().transform((input, ctx) => {
  const parsed = manifestValidator.validate(input);
  if (parsed.ok) return parsed.value;
  ctx.addIssue({ code: 'custom', message: '插件清单格式无效' }); return z.NEVER;
});
export const packagePathSchema = z.string().min(1).max(240).regex(/^[a-zA-Z0-9_./-]+$/)
  .refine(path => !path.startsWith('/') && path.split('/').every(part => part !== '..' && part !== '' && part !== '.'), '包内路径无效');
export const packageDeclarationSchema = z.strictObject({ formatVersion: z.literal(1), manifest,
  entries: z.strictObject({ node: packagePathSchema.optional(), browser: packagePathSchema.optional() })
    .refine(value => !!(value.node || value.browser), '缺少包入口'),
  assets: z.record(z.string().regex(/^[a-zA-Z0-9_.-]+$/), packagePathSchema).refine(value => Object.keys(value).length <= 64),
  shared: z.array(z.string().min(1).max(100)).max(16).refine(value => new Set(value).size === value.length),
});
const name = z.string().max(214).regex(/^(?:@[a-z0-9_.-]+\/)?[a-z0-9][a-z0-9_.-]*$/);
export const browserPackageSchema = z.strictObject({ formatVersion: z.literal(1), name,
  declaration: packageDeclarationSchema, code: z.string().min(1).max(2_097_152),
  assets: z.record(z.string().regex(/^[a-zA-Z0-9_.-]+$/), z.strictObject({
    type: z.enum(['image/png', 'image/jpeg', 'image/svg+xml', 'text/css', 'text/plain']),
    base64: z.string().max(2_097_152).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  })).refine(value => Object.keys(value).length <= 64), integrity: z.string().regex(/^[a-f0-9]{64}$/),
});
export const packageArtifactSchema = z.strictObject({ kind: z.literal('npm'), key: z.string().regex(/^[a-zA-Z0-9-]{1,64}$/),
  name, version: z.string().min(1).max(256), manifest, integrity: z.string().regex(/^[a-f0-9]{64}$/),
  source: z.string().min(1).max(512), browser: browserPackageSchema.optional(),
});

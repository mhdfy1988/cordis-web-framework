import { z } from 'zod';
import { zodConfig, manifestValidator } from './index.ts';
import type { InstallationDocument, PluginArtifact } from '../contracts/management.ts';
import { packageArtifactSchema } from './packages.ts';

const id = z.string().min(1).max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const manifest = z.unknown().transform((input, ctx) => {
  const result = manifestValidator.validate(input);
  if (result.ok) return result.value;
  ctx.addIssue({ code: 'custom', message: '插件清单格式无效' }); return z.NEVER;
});
export const artifactSchema = z.strictObject({
  formatVersion: z.literal(1), manifest,
  entries: z.strictObject({ browser: z.string().min(1).max(2_097_152).optional(), node: z.string().min(1).max(2_097_152).optional() })
    .refine(value => value.browser !== undefined || value.node !== undefined, '至少提供一个平台入口'),
  assets: z.array(z.strictObject({ id, type: z.enum(['text/css', 'text/plain']), source: z.string().max(1_048_576) })).max(64)
    .refine(items => new Set(items.map(item => item.id)).size === items.length, '资源标识重复'),
  integrity: z.string().regex(/^[a-f0-9]{64}$/),
});
export const artifactValidator = zodConfig<PluginArtifact>(artifactSchema);
const installation = z.strictObject({ id, version: z.string().min(1).max(256), artifact: artifactSchema.optional(),
  package: packageArtifactSchema.optional(),
  enabled: z.boolean(), config: z.json(), bindings: z.record(z.string().min(1).max(200), id) })
  .refine(value => !(value.artifact && value.package), '安装来源不能重复');
export const installationValidator = zodConfig(installation);
export const installationDocumentValidator = zodConfig<InstallationDocument>(z.strictObject({ formatVersion: z.literal(1),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), plugins: z.array(installation).max(128)
    .refine(items => new Set(items.map(item => item.id)).size === items.length, '安装身份重复'),
  operation: z.strictObject({ id: z.string().min(1).max(200), action: z.enum(['install', 'enable', 'disable', 'uninstall', 'configure', 'recover']),
    pluginId: z.string().min(1).max(200), state: z.enum(['pending', 'failed', 'succeeded']), error: z.string().max(1024).optional() }).optional(),
}));

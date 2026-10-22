import { z } from 'zod';
export const headingSchema = z.strictObject({ id: z.string(), text: z.string(), level: z.number().int().min(1).max(6) });
export const pageMetaSchema = z.strictObject({ id: z.string(), title: z.string(), route: z.string().startsWith('/'), group: z.string(), file: z.string() });
export const pageSchema = pageMetaSchema.extend({ html: z.string(), headings: z.array(headingSchema), text: z.string() });
export const manifestSchema = z.strictObject({ version: z.literal(1), base: z.string(), pages: z.array(pageMetaSchema).min(1), builtAt: z.string() });
export type Heading = z.infer<typeof headingSchema>;
export type PageMeta = z.infer<typeof pageMetaSchema>;
export type DocumentPage = z.infer<typeof pageSchema>;
export type SiteManifest = z.infer<typeof manifestSchema>;
export const tokenize = (text: string): string[] => [...new Intl.Segmenter('zh-CN', { granularity: 'word' }).segment(text)]
  .filter(item => item.isWordLike).map(item => item.segment.toLowerCase());
export const searchOptions = { fields: ['title', 'text'], storeFields: ['title', 'route'], tokenize };

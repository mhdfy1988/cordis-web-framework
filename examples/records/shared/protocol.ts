import { z } from 'zod';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import type { JsonOperation } from 'cordis-web-framework/contracts/http';

export const recordSchema = z.strictObject({ id: z.string().min(1).max(64), title: z.string().trim().min(1).max(100),
  body: z.string().max(4000), revision: z.number().int().min(1), canEdit: z.boolean() });
export type RecordView = z.infer<typeof recordSchema>;
export const saveSchema = z.strictObject({ id: z.string().min(1).max(64), title: z.string().trim().min(1).max(100),
  body: z.string().max(4000), revision: z.number().int().min(1) });
export type SaveInput = z.infer<typeof saveSchema>;
const sessionInput = z.strictObject({ mode: z.enum(['editor', 'viewer']) });
const sessionOutput = z.strictObject({ token: z.string().min(20).max(1024), mode: z.enum(['editor', 'viewer']) });
export const sessionOperation: JsonOperation<z.infer<typeof sessionInput>, z.infer<typeof sessionOutput>> = {
  method: 'POST', path: '/demo/session', input: zodConfig(sessionInput), output: zodConfig(sessionOutput),
};
export const listOperation: JsonOperation<Record<string, never>, { records: RecordView[] }> = {
  method: 'GET', path: '/api/records', input: zodConfig(z.strictObject({})), output: zodConfig(z.strictObject({ records: z.array(recordSchema).max(10) })),
};
export const saveOperation: JsonOperation<SaveInput, RecordView> = {
  method: 'PUT', path: '/api/record', input: zodConfig(saveSchema), output: zodConfig(recordSchema),
};

import { service } from 'cordis-web-framework';
import type { RecordView, SaveInput } from '../shared/protocol.ts';
import type { ApiRequestContext } from 'cordis-web-framework/contracts/http';

export interface Principal { readonly subject: string; readonly canWrite: boolean }
export interface StoredRecord extends Omit<RecordView, 'canEdit'> { readonly owner: string }
export interface RecordRepository {
  list(subject: string): StoredRecord[];
  read(id: string): StoredRecord;
  save(subject: string, input: SaveInput, signal: AbortSignal): StoredRecord;
  close(): void;
}
export interface IdentityProvider {
  issue(mode: 'editor' | 'viewer'): { token: string; mode: 'editor' | 'viewer' };
  authenticate(credential?: string): Principal;
  close(): void;
}
export interface RecordService {
  list(principal: Principal): { records: RecordView[] };
  save(context: ApiRequestContext, principal: Principal, input: SaveInput): Promise<RecordView>;
}
export const repositoryKey = service<RecordRepository>('records.repository');
export const identityKey = service<IdentityProvider>('records.identity');
export const recordsKey = service<RecordService>('records.service');

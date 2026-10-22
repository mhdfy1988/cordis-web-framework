import { ApiError } from 'cordis-web-framework/http-json';
import type { RecordService, RecordRepository, StoredRecord, Principal } from './contracts.ts';
import type { ApiRequestContext } from 'cordis-web-framework/contracts/http';
import type { SaveInput, RecordView } from '../shared/protocol.ts';

export interface RecordHooks {
  readonly beforeSave?: (context: ApiRequestContext, input: SaveInput) => Promise<void>;
  readonly afterCommit?: (context: ApiRequestContext, saved: RecordView) => Promise<void>;
}
export function createRecordService(repository: RecordRepository, hooks: RecordHooks = {}): RecordService {
  const view = (value: StoredRecord, principal: Principal): RecordView => ({ id: value.id, title: value.title,
    body: value.body, revision: value.revision, canEdit: principal.canWrite });
  return {
    list(principal) { return { records: repository.list(principal.subject).map(value => view(value, principal)) }; },
    async save(context, principal, input) {
      if (!principal.canWrite) throw new ApiError('forbidden');
      const previous = repository.read(input.id);
      if (previous.owner !== principal.subject) throw new ApiError('forbidden');
      await hooks.beforeSave?.(context, input);
      context.signal.throwIfAborted();
      const saved = view(repository.save(principal.subject, input, context.signal), principal);
      context.logger.child({ pluginId: 'records.service' }).log('info', 'records.committed', { recordId: saved.id, revision: saved.revision, subject: principal.subject });
      await hooks.afterCommit?.(context, saved);
      return saved;
    },
  };
}

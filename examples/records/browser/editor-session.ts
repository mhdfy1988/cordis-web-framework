import { ApiClientError, createJsonClient } from 'cordis-web-framework/http-json';
import { listOperation, saveOperation, sessionOperation, type RecordView } from '../shared/protocol.ts';

export interface EditorState {
  readonly mode?: 'editor' | 'viewer';
  readonly records: readonly RecordView[];
  readonly selectedId?: string;
  readonly draft: { readonly title: string; readonly body: string };
  readonly busy?: 'loading' | 'saving' | 'checking';
  readonly uncertain: boolean;
  readonly status: string;
  readonly error: boolean;
}
export type RecordClient = ReturnType<typeof createJsonClient>;
export function createEditorSession(client: RecordClient, setCredential: (token: string | undefined) => void) {
  let state: EditorState = { records: [], draft: { title: '', body: '' }, uncertain: false, status: '请选择本地演示身份', error: false };
  let sequence = 0;
  let disposed = false;
  let controller: AbortController | undefined;
  const listeners = new Set<(state: EditorState) => void>();
  const selected = () => state.records.find(item => item.id === state.selectedId);
  const dirty = () => !!selected() && (state.draft.title !== selected()!.title || state.draft.body !== selected()!.body);
  const update = (changes: Partial<EditorState>) => {
    if (disposed) return;
    state = Object.freeze({ ...state, ...changes });
    for (const listener of listeners) listener(state);
  };
  function begin(busy: EditorState['busy']) {
    if (disposed) throw new Error('编辑会话已关闭');
    controller?.abort(); controller = new AbortController(); const id = ++sequence;
    update({ busy, error: false });
    return { signal: controller.signal, current: () => !disposed && id === sequence };
  }
  function failed(error: unknown, saving = false) {
    const code = error instanceof ApiClientError ? error.code : 'network-error';
    const messages: Record<string, string> = { forbidden: '没有保存权限', unauthenticated: '演示凭据已失效，请重新选择身份',
      'invalid-input': '请填写标题并检查内容长度', conflict: '修订冲突，请核对服务器',
      'protocol-incompatible': '前后端协议不兼容', 'internal-error': '服务器处理失败，请核对服务器',
      unavailable: '服务暂不可用', 'network-error': '网络请求失败', 'invalid-response': '服务器响应不符合契约', cancelled: '请求已取消' };
    const uncertain = saving && !['forbidden', 'unauthenticated', 'invalid-input', 'protocol-incompatible'].includes(code);
    const requestId = error instanceof ApiClientError && error.requestId ? `（请求 ${error.requestId}）` : '';
    update({ busy: undefined, error: true, uncertain, status: (messages[code] ?? '请求失败') + requestId });
  }
  return Object.freeze({
    inspect: () => state,
    dirty,
    subscribe(listener: (value: EditorState) => void) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
    edit(field: 'title' | 'body', value: string) {
      if (disposed || state.busy || !selected()?.canEdit) return;
      update({ draft: Object.freeze({ ...state.draft, [field]: value }), status: state.uncertain ? state.status : '草稿未保存', error: false });
    },
    select(id: string) {
      if (disposed || state.busy || state.uncertain) return;
      const record = state.records.find(item => item.id === id); if (!record) return;
      update({ selectedId: id, draft: Object.freeze({ title: record.title, body: record.body }), status: '已读取', error: false });
    },
    async identify(mode: 'editor' | 'viewer') {
      const task = begin('loading');
      setCredential(undefined);
      update({ mode: undefined, records: [], selectedId: undefined, draft: Object.freeze({ title: '', body: '' }), uncertain: false });
      try {
        const session = await client.request(sessionOperation, { mode }, task.signal);
        if (!task.current()) return;
        setCredential(session.data.token);
        const result = await client.request(listOperation, {}, task.signal);
        if (!task.current()) return;
        const record = result.data.records[0];
        update({ mode, records: result.data.records.map(value => Object.freeze(value)), selectedId: record?.id,
          draft: Object.freeze({ title: record?.title ?? '', body: record?.body ?? '' }), uncertain: false,
          busy: undefined, status: mode === 'viewer' ? '只读身份，不能保存' : '已读取', error: false });
      } catch (error) { if (task.current()) { setCredential(undefined); failed(error); } }
    },
    async save() {
      const record = selected(); if (!record?.canEdit || state.busy || state.uncertain || !dirty()) return;
      const input = { id: record.id, revision: record.revision, ...state.draft };
      const task = begin('saving');
      update({ status: '正在保存' });
      try {
        const result = await client.request(saveOperation, input, task.signal);
        if (!task.current()) return;
        update({ records: state.records.map(value => value.id === record.id ? Object.freeze(result.data) : value),
          draft: Object.freeze({ title: result.data.title, body: result.data.body }), busy: undefined, status: '已保存', error: false, uncertain: false });
      } catch (error) { if (task.current()) failed(error, true); }
    },
    async checkServer() {
      if (state.busy || !state.mode) return;
      const task = begin('checking');
      try {
        const result = await client.request(listOperation, {}, task.signal);
        if (!task.current()) return;
        const record = result.data.records.find(item => item.id === state.selectedId);
        const same = record?.title === state.draft.title && record?.body === state.draft.body;
        update({ records: result.data.records.map(value => Object.freeze(value)), busy: undefined, uncertain: false, error: false,
          status: same ? '已核对，服务器已保存' : '服务器内容不同，草稿已保留；确认后可保存' });
      } catch (error) { if (task.current()) { failed(error); update({ uncertain: true }); } }
    },
    cancel() {
      if (!state.busy || disposed) return;
      const saving = state.busy === 'saving';
      if (state.busy === 'loading') setCredential(undefined);
      sequence++; controller?.abort();
      update({ busy: undefined, uncertain: saving || state.uncertain, error: false,
        status: saving ? '已停止等待，保存结果未确认；请核对服务器' : '读取已取消' });
    },
    dispose() { if (disposed) return; disposed = true; sequence++; controller?.abort(); setCredential(undefined); listeners.clear(); },
  });
}
export type EditorSession = ReturnType<typeof createEditorSession>;

import { shallowRef } from 'vue';
import { pageSchema } from '../shared/documents.ts';
import type { PageMeta } from '../shared/documents.ts';
import type { DocumentSession } from './contracts.ts';

export function createDocumentSession(base: string): DocumentSession {
  const state: DocumentSession['state'] = shallowRef({ status: 'loading' });
  let controller: AbortController | undefined; let generation = 0; let closed = false;
  return { state, async select(meta: PageMeta | undefined) {
    controller?.abort(); const current = ++generation; controller = new AbortController(); state.value = { status: 'loading' };
    if (!meta) { state.value = { status: 'error', error: '未找到该文档，请从章节导航选择页面。' }; return; }
    try {
      if (closed) throw new Error('文档会话已关闭');
      const response = await fetch(base + meta.file, { signal: controller.signal });
      if (!response.ok) throw new Error(`文档请求失败（${response.status}）`);
      const page = pageSchema.parse(await response.json()); if (page.id !== meta.id) throw new Error('文档身份不一致');
      if (!closed && generation === current) { state.value = { status: 'ready', page }; document.title = page.title + ' · Cordis Web Framework'; }
    } catch (error) {
      if (!closed && generation === current && !controller.signal.aborted) state.value = { status: 'error', error: error instanceof Error ? error.message : '文档读取失败' };
    }
  }, close() { closed = true; generation++; controller?.abort(); state.value = { status: 'error', error: '文档会话已关闭' }; } };
}

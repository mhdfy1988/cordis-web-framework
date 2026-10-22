import { ref } from 'vue';
import type { Clipboard } from './contracts.ts';
export function createClipboard(): Clipboard {
  const message = ref(''); let generation = 0; let closed = false;
  return { message, async copy(text) { const current = ++generation; if (closed) throw new Error('复制插件已关闭');
    try { await navigator.clipboard.writeText(text); if (!closed && current === generation) message.value = '已复制代码'; }
    catch { if (!closed && current === generation) message.value = '复制失败，请手动选择代码。'; }
  }, close() { closed = true; generation++; message.value = ''; } };
}

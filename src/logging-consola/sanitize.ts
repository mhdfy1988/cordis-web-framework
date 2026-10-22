import type { LogValue } from '../contracts/logging.ts';
import { freezeData } from '../data/immutable.ts';

const secret = /password|passwd|token|authorization|cookie|secret|api[-_]?key/i;
/** 结构化字段有界复制；自由文本不承诺自动识别秘密，调用者不得写入令牌或原始请求体。 */
export function sanitizeFields(input: Readonly<Record<string, unknown>>): Readonly<Record<string, LogValue>> {
  const active = new WeakSet<object>();
  let budget = 128;
  function visit(value: unknown, depth: number): LogValue {
    if (--budget < 0 || depth > 5) return '[Truncated]';
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.slice(0, 512);
    if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
    if (value instanceof Error) return { name: value.name.slice(0, 100), message: value.message.slice(0, 512) };
    if (typeof value !== 'object') return `[${typeof value}]`;
    if (active.has(value)) return '[Circular]';
    active.add(value);
    try {
      if (Array.isArray(value)) return value.slice(0, 32).map(item => visit(item, depth + 1));
      const entries: [string, LogValue][] = [];
      for (const key of Object.keys(value).slice(0, 32)) {
        if (budget < 0) break;
        if (secret.test(key)) { entries.push([key.slice(0, 100), '[REDACTED]']); budget--; continue; }
        try { entries.push([key.slice(0, 100), visit(Reflect.get(value, key), depth + 1)]); }
        catch { entries.push([key.slice(0, 100), '[Unreadable]']); }
      }
      return Object.fromEntries(entries);
    } finally { active.delete(value); }
  }
  return freezeData(visit(input, 0) as Record<string, LogValue>);
}

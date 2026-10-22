import type { Diagnostic } from '../contracts/runtime.ts';

/** 诊断归运行实例所有；快照不泄露可写 Error 或 Cordis 日志对象。 */
export function createDiagnostics() {
  const entries: Diagnostic[] = [];
  const seen = new WeakMap<object, Set<string>>();
  const identity = (instanceId?: string) => instanceId ?? 'runtime';
  return {
    record(detail: Omit<Diagnostic, 'message'>, error: unknown) {
      if (error && typeof error === 'object') {
        const keys = seen.get(error) ?? new Set<string>();
        const key = `${identity(detail.instanceId)}:${detail.phase}`;
        if (keys.has(key)) return;
        keys.add(key);
        seen.set(error, keys);
      }
      entries.push(Object.freeze({ ...detail,
        message: error instanceof Error ? error.message : String(error) }));
    },
    hasReported(error: unknown, instanceId?: string) {
      if (!error || typeof error !== 'object') return false;
      return [...(seen.get(error) ?? [])].some(key => key.startsWith(`${identity(instanceId)}:`));
    },
    snapshot(instanceId?: string): readonly Diagnostic[] {
      return Object.freeze(entries.filter(entry => !instanceId || entry.instanceId === instanceId));
    },
  };
}

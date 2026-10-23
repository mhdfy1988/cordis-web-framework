import type { UiAccess, UiContribution, UiContext, UiDiagnostic, UiHandle, UiPosition, UiPositions, UiRegistry, UiSelection } from '../contracts/ui.ts';
import { matchesVersion } from '../version-semver/index.ts';
import { validateContribution } from './validation.ts';
export type * from '../contracts/ui.ts';

/** 应用声明表的类型化读取；动态出口仍走相同运行时校验，不把类型声明当成授权。 */
export function resolveUiPosition<K extends keyof UiPositions & string>(registry: UiRegistry, target: K,
  context: Omit<UiContext, 'props'> & { readonly props: UiPositions[K] }, request?: { access?: UiAccess; entryKey?: string }) {
  return registry.resolve(target, context as UiContext, request);
}

export class UiError extends Error {
  readonly diagnostic: UiDiagnostic;
  constructor(diagnostic: UiDiagnostic) { super(`${diagnostic.code}: ${diagnostic.target}${diagnostic.contributionId ? ` / ${diagnostic.contributionId}` : ''}`); this.name = 'UiError'; this.diagnostic = diagnostic; }
}
interface Position { spec: UiPosition; owner: number; generation: number }
interface Entry { spec: UiContribution; handle: UiHandle; failed: Set<string | undefined>; live: boolean }
interface Waiter { target: string; install: () => (() => void); generation?: number; cleanup?: () => void; live: boolean }

/** 只选择贡献与维护声明生命周期；不挂载组件、不获取业务全局状态。 */
export function createUiRegistry(options: { onDiagnostic?: (diagnostic: UiDiagnostic) => void } = {}): UiRegistry {
  const positions = new Map<string, Position>([['root', { spec: { name: 'root', kind: 'single', scope: 'root', version: '1.0.0' }, owner: 0, generation: 0 }]]);
  const entries = new Map<number, Entry>();
  const accesses = new WeakMap<UiAccess, number>();
  const waiters = new Set<Waiter>(); const observers = new Set<() => void>(); const diagnostics: UiDiagnostic[] = [];
  let sequence = 0; let version = 0; let closed = false; let notifying = false; let changed = false; let mutation = 0;
  let cleanupFailures = 0;
  function report(diagnostic: UiDiagnostic) {
    const frozen = Object.freeze(diagnostic); if (diagnostics.length >= 128) diagnostics.shift(); diagnostics.push(frozen);
    try { options.onDiagnostic?.(frozen); } catch { /* 诊断输出不能破坏清理。 */ }
  }
  function reject(code: UiDiagnostic['code'], target: string, contributionId?: string): never {
    const diagnostic = { code, target, contributionId }; report(diagnostic); throw new UiError(diagnostic);
  }
  function assertOpen() { if (closed) throw new Error('界面注册表已关闭'); if (cleanupFailures) throw new Error('界面注册表清理失败，不可复用'); }
  function checkCleanup(before = 0) { if (cleanupFailures > before) throw new Error('界面声明期清理失败'); }
  function cleanupWaiter(waiter: Waiter) {
    const cleanup = waiter.cleanup; waiter.cleanup = undefined;
    try {
      const result: unknown = cleanup?.();
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        void Promise.resolve(result).catch(() => report({ code: 'cleanup-failed', target: waiter.target }));
        cleanupFailures++; report({ code: 'cleanup-failed', target: waiter.target });
      }
    } catch { cleanupFailures++; report({ code: 'cleanup-failed', target: waiter.target }); }
  }
  function notify() {
    version++; changed = true;
    if (notifying || mutation) return;
    notifying = true;
    try {
      let rounds = 0;
      while (changed && !closed) {
        if (++rounds > 128) { changed = false; report({ code: 'observer-failed', target: 'root' }); break; }
        changed = false;
        for (const waiter of [...waiters]) {
          if (!waiter.live) continue;
          const generation = positions.get(waiter.target)?.generation;
          if (generation === waiter.generation) continue;
          cleanupWaiter(waiter); waiter.generation = generation;
          if (generation !== undefined && waiter.live) {
            try {
              const cleanup = waiter.install();
              if (typeof cleanup !== 'function') throw new Error('声明期安装必须返回同步撤销函数');
              if (waiter.live && positions.get(waiter.target)?.generation === generation) waiter.cleanup = cleanup;
              else cleanup();
            } catch { report({ code: 'wait-failed', target: waiter.target }); }
          }
        }
        for (const observer of [...observers]) try { observer(); } catch { report({ code: 'observer-failed', target: 'root' }); }
      }
    } finally { notifying = false; }
  }
  function remove(instance: number) {
    const entry = entries.get(instance); if (!entry?.live) return;
    const before = cleanupFailures;
    mutation++;
    try {
      entry.live = false; entries.delete(instance);
      const children = [...positions].filter(([, position]) => position.owner === instance).map(([name]) => name);
      for (const name of children) {
        positions.delete(name);
        for (const child of [...entries.values()]) if (child.spec.target === name) remove(child.handle.instance);
      }
    } finally { mutation--; }
    notify();
    if (!mutation) checkCleanup(before);
  }
  function registerDynamic(input: UiContribution): UiHandle {
    assertOpen(); const spec = validateContribution(input); const position = positions.get(spec.target);
    if (!position) reject('undeclared', spec.target, spec.id);
    if (!matchesVersion(position.spec.version, spec.range)) reject('incompatible', spec.target, spec.id);
    if (position.spec.kind === 'keyed' && !spec.key || position.spec.kind !== 'keyed' && spec.key
      || position.spec.kind === 'chain' && !spec.select || position.spec.kind !== 'chain' && spec.select) throw new TypeError('位置种类必填字段不匹配');
    const unit = (value: UiContribution) => position.spec.kind === 'single' ? '' : position.spec.kind === 'keyed' ? value.key : value.id;
    if (position.spec.kind !== 'chain' && [...entries.values()].some(entry => entry.spec.target === spec.target
      && unit(entry.spec) === unit(spec) && (entry.spec.priority ?? 0) === (spec.priority ?? 0))) reject('conflict', spec.target, spec.id);
    const names = new Set<string>();
    for (const child of spec.children ?? []) {
      if (positions.has(child.name) || names.has(child.name)) reject('conflict', child.name, spec.id);
      names.add(child.name);
    }
    if (entries.size >= 1024 || positions.size + names.size > 256) throw new Error('界面注册容量超限');
    const instance = ++sequence; const access = Object.freeze({ owner: instance }); accesses.set(access, instance);
    const handle = Object.freeze({ instance, id: spec.id, children: access, dispose: () => remove(instance) });
    entries.set(instance, { spec, handle, failed: new Set(), live: true });
    for (const child of spec.children ?? []) positions.set(child.name, { spec: child, owner: instance, generation: ++sequence });
    notify(); return handle;
  }
  return Object.freeze({ register: registerDynamic, registerDynamic,
    inject(target: string, install: () => (() => void)) {
      assertOpen(); if (!target.trim() || typeof install !== 'function' || waiters.size >= 1024) throw new TypeError('位置等待无效或超限');
      const waiter: Waiter = { target, install, live: true }; waiters.add(waiter); notify();
      return () => {
        if (!waiter.live) return;
        const before = cleanupFailures; waiter.live = false; waiters.delete(waiter); cleanupWaiter(waiter); notify(); checkCleanup(before);
      };
    },
    resolve(target: string, context: UiContext, request: { access?: UiAccess; entryKey?: string } = {}) {
      assertOpen(); const position = positions.get(target);
      if (!position) reject('undeclared', target);
      if (target !== 'root' && (!request.access || accesses.get(request.access) !== position.owner || !entries.has(position.owner))) reject('unauthorized', target);
      if (!context || !context.props || typeof context.props !== 'object' || Array.isArray(context.props)
        || !['root', 'session'].includes(context.scope) || context.scope === 'session' && (!context.sessionId || context.sessionId.length > 128)
        || context.scope === 'root' && context.sessionId || position.spec.scope === 'root' && context.scope !== 'root'
        || position.spec.scope === 'session' && context.scope !== 'session') reject('scope', target);
      const failureScope = context.sessionId;
      const failures = new Set<string>();
      let candidates = [...entries.values()].filter(entry => entry.spec.target === target);
      if (position.spec.kind === 'keyed') candidates = candidates.filter(entry => entry.spec.key === request.entryKey);
      candidates.sort((a, b) => (a.spec.priority ?? 0) - (b.spec.priority ?? 0) || a.handle.instance - b.handle.instance);
      const selected = new Map<string, UiSelection>();
      for (const entry of candidates) {
        const unit = position.spec.kind === 'list' ? entry.spec.id : '';
        if (entry.failed.has(failureScope)) { failures.add(unit); continue; }
        let matched: unknown;
        if (position.spec.kind === 'chain') {
          try {
            matched = entry.spec.select!(Object.freeze({ ...context.props }));
            if (matched && typeof (matched as Promise<unknown>).then === 'function') {
              void Promise.resolve(matched).catch(() => report({ code: 'selector-failed', target, contributionId: entry.spec.id }));
              throw new Error('选择器必须同步返回');
            }
          }
          catch { report({ code: 'selector-failed', target, contributionId: entry.spec.id }); continue; }
          if (matched === null) continue;
        }
        if (!selected.has(unit)) selected.set(unit, Object.freeze({ instance: entry.handle.instance, contribution: entry.spec,
          children: entry.handle.children, ...(position.spec.kind === 'chain' ? { matched } : {}) }));
        if (position.spec.kind !== 'list') break;
      }
      const values = [...selected.values()];
      const failedUnits = [...failures].filter(unit => !selected.has(unit));
      if (position.spec.kind === 'list') values.sort((a, b) => (a.contribution.order ?? 0) - (b.contribution.order ?? 0) || a.instance - b.instance);
      return Object.freeze({ entries: Object.freeze(values), failed: failedUnits.length > 0, failedUnits: Object.freeze(failedUnits), kind: position.spec.kind });
    },
    fail(instance: number, sessionId?: string) {
      const entry = entries.get(instance); if (!entry) return;
      if (positions.get(entry.spec.target)?.spec.kind === 'chain') throw new Error('选择链组件故障由局部边界呈现，不改选其他候选');
      const key = sessionId; if (entry.failed.has(key)) return;
      if (entry.failed.size >= 256) throw new Error('请先释放不再使用的界面会话');
      entry.failed.add(key); report({ code: 'render-failed', target: entry.spec.target, contributionId: entry.spec.id }); notify();
    },
    releaseSession(sessionId: string) { for (const entry of entries.values()) entry.failed.delete(sessionId); notify(); },
    inspect() { return Object.freeze({ version, positions: Object.freeze([...positions.keys()]), contributions: entries.size,
      waiters: waiters.size, observers: observers.size, closed, cleanupFailures, diagnostics: Object.freeze([...diagnostics]) }); },
    subscribe(listener: () => void) { assertOpen(); observers.add(listener); return () => { observers.delete(listener); }; },
    close() {
      if (closed) { checkCleanup(); return; }
      closed = true;
      for (const waiter of [...waiters]) { waiter.live = false; waiters.delete(waiter); cleanupWaiter(waiter); }
      for (const instance of [...entries.keys()]) remove(instance);
      observers.clear(); positions.clear(); closed = true;
      checkCleanup();
    },
  });
}

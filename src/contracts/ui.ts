/** 可通过模块扩充声明应用位置及其最小输入，不把 Vue 类型写入此表。 */
export interface UiPositions { root: Record<string, unknown> }
export type UiKind = 'single' | 'list' | 'keyed' | 'chain';
export type UiScope = 'root' | 'session-maybe' | 'session';
export interface UiPosition {
  readonly name: string; readonly kind: UiKind; readonly scope: UiScope; readonly version: string;
}
export interface UiContext {
  readonly scope: 'root' | 'session'; readonly sessionId?: string; readonly props: Readonly<Record<string, unknown>>;
}
export interface UiContribution {
  readonly id: string; readonly target: string; readonly range: string; readonly renderer: string; readonly view: string;
  readonly key?: string; readonly priority?: number; readonly order?: number;
  readonly children?: readonly UiPosition[];
  readonly select?: (props: Readonly<Record<string, unknown>>) => unknown | null;
}
export interface UiDiagnostic {
  readonly code: 'conflict' | 'undeclared' | 'incompatible' | 'scope' | 'unauthorized' | 'render-failed' | 'selector-failed' | 'observer-failed' | 'wait-failed' | 'cleanup-failed';
  readonly target: string; readonly contributionId?: string;
}
export interface UiLease { readonly instance: number; readonly id: string; dispose(): void }
/** 令牌不包含 DOM 节点；只有所属注册表和仍存活的声明者可以授权子出口。 */
export interface UiAccess { readonly owner: number }
export interface UiHandle extends UiLease { readonly children: UiAccess }
export interface UiSelection {
  readonly instance: number; readonly contribution: UiContribution; readonly children: UiAccess; readonly matched?: unknown;
}
export interface UiResolution {
  readonly entries: readonly UiSelection[]; readonly failed: boolean; readonly kind: UiKind;
  /** 列表中的某一单元失败不应吞掉其他单元，也不能伪装成自然空白。 */
  readonly failedUnits: readonly string[];
}
export interface UiSnapshot {
  readonly version: number; readonly positions: readonly string[]; readonly contributions: number; readonly waiters: number; readonly observers: number;
  readonly closed: boolean; readonly cleanupFailures: number;
  readonly diagnostics: readonly UiDiagnostic[];
}
export interface UiRegistry {
  register<K extends keyof UiPositions & string>(spec: Omit<UiContribution, 'target'> & { readonly target: K }): UiHandle;
  /** 动态模块的同一运行时校验入口；类型化应用优先使用 register。 */
  registerDynamic(spec: UiContribution): UiHandle;
  inject(target: string, install: () => (() => void)): () => void;
  resolve(target: string, context: UiContext, options?: { access?: UiAccess; entryKey?: string }): UiResolution;
  fail(instance: number, sessionId?: string): void;
  releaseSession(sessionId: string): void;
  inspect(): UiSnapshot;
  subscribe(listener: () => void): () => void;
  close(): void;
}

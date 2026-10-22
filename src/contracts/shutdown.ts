import type { RuntimeSnapshot } from './runtime.ts';

export type ShutdownState = 'running' | 'stopping' | 'timed-out' | 'stopped' | 'cleanup-failed';
export interface ShutdownSnapshot {
  readonly state: ShutdownState;
  readonly runtime: RuntimeSnapshot;
  readonly error?: string;
}
export interface ShutdownController {
  inspect(): ShutdownSnapshot;
  /** 发起一次关闭；预算到期可返回 timed-out，但不声称清理完成。重复调用共享结果。 */
  stop(): Promise<ShutdownSnapshot>;
  /** 显式等待真正收尾，可能没有期限；不会解除隔离或重开运行时。 */
  completion(): Promise<ShutdownSnapshot>;
}

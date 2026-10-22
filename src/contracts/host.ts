import type { HostEnvironment, PluginCatalog } from './composition.ts';
import type { Cleanup, Runtime, RuntimeSnapshot } from './runtime.ts';
import type { ShutdownSnapshot, ShutdownState } from './shutdown.ts';
import type { PluginManager, PluginManagerOptions } from './management.ts';

/** 呈现和 HTTP 适配只观察运行时，不获得装载／关闭的第二条入口。 */
export type HostRuntimeView = Pick<Runtime, 'inspect' | 'audit' | 'subscribe'> & { readonly management?: PluginManager };
export type HostState = 'ready' | 'not-ready' | Exclude<ShutdownState, 'running'>;
export interface HostSnapshot {
  readonly state: HostState;
  readonly environment: HostEnvironment;
  readonly runtime: RuntimeSnapshot;
  readonly error?: string;
}
export interface HostHandle {
  readonly management?: PluginManager;
  inspect(): HostSnapshot;
  stop(): Promise<ShutdownSnapshot>;
  completion(): Promise<ShutdownSnapshot>;
}
export interface HostOptions {
  /** 动态管理模式使用自身内置定义；此时 document.plugins 和 catalog 必须为空，避免双重装配。 */
  readonly management?: Omit<PluginManagerOptions, 'runtime' | 'environment'>;
  readonly document: unknown;
  readonly catalog: PluginCatalog;
  readonly createRuntime: () => Runtime;
  readonly shutdownTimeoutMs?: number;
  /** 缺省检查全部已装载插件；应用可显式排除允许主动停用的可选扩展，不隐藏其诊断。 */
  readonly requiredPluginIds?: readonly string[];
}
export interface HostResourceContext {
  readonly runtime: HostRuntimeView;
  /** 申请资源前登记，确保申请到一半失败也能回收；只允许登记一次。 */
  onRelease(cleanup: Cleanup): void;
}

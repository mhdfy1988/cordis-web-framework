/** 第一版仅接可信进程内模块，不是外部插件清单解析器或安全沙箱。 */
export interface ServiceKey<T = unknown> {
  readonly id: string;
  readonly valueType?: T;
}

export function service<T>(id: string): ServiceKey<T> {
  if (!id.trim()) throw new TypeError('服务标识不能为空');
  return Object.freeze({ id });
}

export type Cleanup = () => void | Promise<void>;

export interface PluginScope {
  readonly signal: AbortSignal;
  get<T>(key: ServiceKey<T>): T;
  provide<T>(key: ServiceKey<T>, value: NoInfer<T>): void;
  onDispose(cleanup: Cleanup): void;
}

export interface PluginDefinition {
  readonly id: string;
  readonly requires?: readonly ServiceKey[];
  readonly provides?: readonly ServiceKey[];
  setup(scope: PluginScope): void | Promise<void>;
}

export type PluginState = 'waiting' | 'starting' | 'ready' | 'failed'
  | 'stopping' | 'stopped' | 'cleanup-failed';

export interface Diagnostic {
  readonly code: 'activation-failed' | 'cleanup-failed' | 'runtime-error' | 'observer-failed';
  readonly phase: 'activation' | 'cleanup' | 'runtime' | 'observation';
  readonly pluginId?: string;
  readonly instanceId?: string;
  readonly message: string;
}

export interface PluginSnapshot {
  readonly id: string;
  readonly instanceId: string;
  readonly generation: number;
  readonly state: PluginState;
  readonly waitingFor: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface RuntimeSnapshot {
  readonly closed: boolean;
  readonly plugins: readonly PluginSnapshot[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface Readiness {
  readonly ready: boolean;
  readonly issues: readonly {
    readonly pluginId: string;
    readonly state: PluginState | 'not-loaded';
    readonly waitingFor: readonly string[];
  }[];
}

export interface PluginHandle {
  inspect(): PluginSnapshot;
  /** 等待当前变动收尾；等待依赖的实例也会返回，不能据此判断就绪。 */
  settle(): Promise<PluginSnapshot>;
  /** 等待真实清理完成；清理失败保留在返回快照中，不伪装干净停用。 */
  stop(): Promise<PluginSnapshot>;
}

export interface Runtime {
  load(plugin: PluginDefinition): PluginHandle;
  inspect(): RuntimeSnapshot;
  settle(): Promise<RuntimeSnapshot>;
  audit(requiredPluginIds?: readonly string[]): Readiness;
  subscribe(listener: (snapshot: RuntimeSnapshot) => void): () => void;
  close(): Promise<RuntimeSnapshot>;
  /** 可选显式归档：只移除干净停止实例的代码引用与记录，不删除诊断。 */
  forgetStopped?(id: string): void;
}

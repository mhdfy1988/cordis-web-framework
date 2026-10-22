import type { HostEnvironment, PluginManifest, RegisteredPlugin } from './composition.ts';
import type { Cleanup, PluginSnapshot, Runtime } from './runtime.ts';
import type { PackageArtifact, PackageInstallOptions, PluginPackageRepository } from './packages.ts';

export interface PluginArtifact {
  readonly formatVersion: 1;
  readonly manifest: PluginManifest;
  readonly entries: { readonly browser?: string; readonly node?: string };
  readonly assets: readonly { readonly id: string; readonly type: 'text/css' | 'text/plain'; readonly source: string }[];
  readonly integrity: string;
}
export interface Installation {
  readonly id: string;
  readonly version: string;
  readonly artifact?: PluginArtifact;
  readonly package?: PackageArtifact;
  readonly enabled: boolean;
  readonly config: unknown;
  readonly bindings: Readonly<Record<string, string>>;
}
export type ManagementAction = 'install' | 'enable' | 'disable' | 'uninstall' | 'configure' | 'recover';
export interface ManagementOperation {
  readonly id: string;
  readonly action: ManagementAction;
  readonly pluginId: string;
  readonly state: 'pending' | 'failed' | 'succeeded';
  readonly error?: string;
}
export interface InstallationDocument {
  readonly formatVersion: 1;
  readonly revision: number;
  readonly plugins: readonly Installation[];
  readonly operation?: ManagementOperation;
}
/** 整个管理器存活期间独占同一安装库；write 必须修订号比较交换并原子提交。 */
export interface PluginStore {
  acquire(): Promise<Cleanup>;
  read(): Promise<unknown | undefined>;
  write(expectedRevision: number, document: InstallationDocument): Promise<void>;
}
export interface PluginModuleLease {
  readonly plugin: RegisteredPlugin;
  release(): void | Promise<void>;
}
export interface PluginModuleLoader {
  load(artifact: PluginArtifact, environment: HostEnvironment): Promise<PluginModuleLease>;
  close?(): void | Promise<void>;
}
export interface BuiltinPlugin {
  readonly plugin: RegisteredPlugin;
  readonly enabled?: boolean;
  readonly required?: boolean;
  readonly config?: unknown;
  readonly bindings?: Readonly<Record<string, string>>;
}
export interface ManagedPluginSnapshot {
  readonly manifest: PluginManifest;
  readonly id: string;
  readonly version: string;
  readonly builtin: boolean;
  readonly required: boolean;
  readonly enabled: boolean;
  readonly state: PluginSnapshot['state'] | 'not-loaded';
  readonly runtime?: PluginSnapshot;
  readonly package?: PackageArtifact;
}
export interface PluginManagerSnapshot {
  readonly revision: number;
  readonly closed: boolean;
  readonly ready: boolean;
  readonly plugins: readonly ManagedPluginSnapshot[];
  readonly operation?: ManagementOperation;
  readonly diagnostics: readonly string[];
}
export interface PluginManagerOptions {
  readonly runtime: Runtime;
  readonly store: PluginStore;
  readonly loader: PluginModuleLoader;
  readonly environment: HostEnvironment;
  readonly builtins?: readonly BuiltinPlugin[];
  readonly packages?: PluginPackageRepository;
  /** 仅全新安装库调用；应用提供旧配置映射，框架校验并一次性持久提交。 */
  readonly initialize?: () => readonly { readonly id: string; readonly enabled: boolean; readonly config: unknown;
    readonly bindings: Readonly<Record<string, string>> }[] | Promise<readonly { readonly id: string; readonly enabled: boolean; readonly config: unknown;
    readonly bindings: Readonly<Record<string, string>> }[]>;
}
export interface PluginManager {
  inspect(): PluginManagerSnapshot;
  subscribe(listener: (snapshot: PluginManagerSnapshot) => void): Cleanup;
  configuration(id: string): Readonly<{ config: unknown; bindings: Readonly<Record<string, string>> }>;
  /** 不执行入口；acceptedIntegrity 必须由可信调用方对精确包内容明确确认。 */
  install(input: unknown, options: { readonly acceptedIntegrity: string; readonly config?: unknown;
    readonly bindings?: Readonly<Record<string, string>> }): Promise<PluginManagerSnapshot>;
  installPackage(input: unknown, options: PackageInstallOptions & { readonly config?: unknown;
    readonly bindings?: Readonly<Record<string, string>> }): Promise<PluginManagerSnapshot>;
  enable(id: string): Promise<PluginManagerSnapshot>;
  disable(id: string): Promise<PluginManagerSnapshot>;
  /** 默认保留应用用户数据；依赖仍存在时拒绝卸载。 */
  uninstall(id: string): Promise<PluginManagerSnapshot>;
  /** restart=true 显式保存新配置和启用意愿，再停止旧实例并重建；默认只允许停用项改配置。 */
  configure(id: string, options: { readonly config: unknown; readonly bindings: Readonly<Record<string, string>>; readonly restart?: boolean }): Promise<PluginManagerSnapshot>;
  /** 拒绝新操作并等待已接纳操作，用于宿主先排空请求、再释放插件。 */
  drain(): Promise<void>;
  /** 停止接收新操作、排空已提交操作并等待真实运行时清理；不修改启停意愿。 */
  close(): Promise<PluginManagerSnapshot>;
}

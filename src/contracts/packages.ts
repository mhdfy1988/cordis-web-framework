import type { PluginManifest, HostEnvironment } from './composition.ts';
import type { PluginModuleLease } from './management.ts';

export interface PackageDeclaration {
  readonly formatVersion: 1;
  readonly manifest: PluginManifest;
  readonly entries: { readonly node?: string; readonly browser?: string };
  readonly assets: Readonly<Record<string, string>>;
  readonly shared: readonly string[];
}
export interface BrowserPackage {
  readonly formatVersion: 1;
  readonly name: string;
  readonly declaration: PackageDeclaration;
  readonly code: string;
  readonly assets: Readonly<Record<string, { readonly type: string; readonly base64: string }>>;
  readonly integrity: string;
}
/** 受管引用不接受调用方任意指定本地可执行路径。 */
export interface PackageArtifact {
  readonly kind: 'npm';
  readonly key: string;
  readonly name: string;
  readonly version: string;
  readonly manifest: PluginManifest;
  readonly integrity: string;
  readonly source: string;
  readonly browser?: BrowserPackage;
}
export interface PackageInstallOptions {
  readonly acceptTrustedCode: true;
  readonly signal?: AbortSignal;
  readonly onProgress?: (phase: 'installing' | 'validating' | 'stored') => void;
}
/** 仓库不拥有启用意愿或运行图；由管理器持锁调用。 */
export interface PluginPackageRepository {
  recover(installed: readonly PackageArtifact[]): Promise<void>;
  stage(input: unknown, options: PackageInstallOptions): Promise<PackageArtifact>;
  validate(artifact: PackageArtifact, environment: HostEnvironment): Promise<void>;
  load(artifact: PackageArtifact, environment: HostEnvironment): Promise<PluginModuleLease>;
  remove(artifact: PackageArtifact): Promise<void>;
  close(): Promise<void>;
}

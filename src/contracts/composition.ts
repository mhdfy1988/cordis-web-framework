import type { PluginDefinition, PluginScope } from './runtime.ts';

// 插件 API、实现版本、服务契约版本和磁盘格式版本分别管理。
export const PLUGIN_API_VERSION = '1.0.0';
export interface PluginManifest {
  readonly id: string;
  readonly version: string;
  readonly apiVersion: string;
  readonly requires: readonly { readonly id: string; readonly range: string }[];
  readonly provides: readonly { readonly id: string; readonly version: string }[];
  readonly host?: {
    readonly platforms: readonly ('browser' | 'node')[];
    readonly capabilities: readonly string[];
  };
}
export interface HostEnvironment {
  readonly platform: 'browser' | 'node';
  readonly capabilities: readonly string[];
}
export interface CompositionDocument {
  readonly formatVersion: 1;
  readonly plugins: readonly {
    readonly id: string;
    readonly version: string;
    readonly entry: string;
    readonly config?: unknown;
  }[];
  readonly bindings: Readonly<Record<string, string>>;
}
export interface ValidationIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}
export type ValidationResult<T> = { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };
export interface ConfigValidator<T> {
  validate(input: unknown): ValidationResult<T>;
}
/** 可信模块入口；验证器须纯净，不做 I/O 或资源申请，setup 才是激活入口。 */
export interface RegisteredPlugin {
  readonly manifest: PluginManifest;
  prepare(config: unknown): ValidationResult<(scope: PluginScope) => void | Promise<void>>;
}
export type PluginCatalog = ReadonlyMap<string, RegisteredPlugin>;
export interface CompositionIssue extends ValidationIssue {
  readonly code: 'invalid-document' | 'invalid-manifest' | 'invalid-host-version'
    | 'duplicate-plugin' | 'module-not-found' | 'identity-mismatch' | 'implementation-mismatch'
    | 'host-incompatible' | 'config-invalid' | 'duplicate-service' | 'duplicate-requirement'
    | 'missing-binding' | 'invalid-binding' | 'service-incompatible' | 'dependency-cycle';
  readonly pluginId?: string;
  readonly serviceId?: string;
}
export interface CompositionPlan {
  readonly plugins: readonly PluginManifest[];
  readonly bindings: Readonly<Record<string, string>>;
}
export type CompositionResult = { readonly ok: true; readonly plan: CompositionPlan }
  | { readonly ok: false; readonly issues: readonly CompositionIssue[] };

// 仅供装配实现内部接线使用；仍然是项目契约，不包含 Cordis 类型。
export interface PreparedPlugin {
  readonly manifest: PluginManifest;
  readonly definition: PluginDefinition;
}

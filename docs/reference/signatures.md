# 公开 API 生成签名

本文件由 `npm.cmd run docs:reference` 从当前 dist 的公开声明生成，不手工修改。行为、默认值及清理责任见 [API 参考](index.md)。

以下按导入入口列出所有导出符号，包括转导出的接口／类型。每段是声明参考，不是单独可运行文件；关联类型在本页其他段落中查询。未列为公开导出的内部类型只在签名引用中出现，不因此变为公开入口。

## cordis-web-framework/presentation-vue/management

导出：`PluginPackagePanel`。

### PluginPackagePanel

```ts
export declare const PluginPackagePanel: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    manager: {
        type: PropType<PluginManager>;
        required: true;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    manager: {
        type: PropType<PluginManager>;
        required: true;
    };
}>> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
```

## cordis-web-framework/management

导出：`artifactIntegrity`、`BrowserPackage`、`BuiltinPlugin`、`createMemoryPluginStore`、`Installation`、`InstallationDocument`、`ManagedPluginSnapshot`、`ManagementAction`、`ManagementOperation`、`PackageArtifact`、`PackageDeclaration`、`packageDigest`、`PackageInstallOptions`、`PluginArtifact`、`PluginManager`、`PluginManagerOptions`、`PluginManagerSnapshot`、`PluginModuleLease`、`PluginModuleLoader`、`PluginPackageRepository`、`PluginStore`、`startPluginManager`、`validateArtifact`、`validateBrowserPackage`、`validatePackageDeclaration`。

### artifactIntegrity

```ts
export declare function artifactIntegrity(input: Omit<PluginArtifact, 'integrity'>): Promise<string>;
```

### BrowserPackage

```ts
export interface BrowserPackage {
    readonly formatVersion: 1;
    readonly name: string;
    readonly declaration: PackageDeclaration;
    readonly code: string;
    readonly assets: Readonly<Record<string, {
        readonly type: string;
        readonly base64: string;
    }>>;
    readonly integrity: string;
}
```

### BuiltinPlugin

```ts
export interface BuiltinPlugin {
    readonly plugin: RegisteredPlugin;
    readonly enabled?: boolean;
    readonly required?: boolean;
    readonly config?: unknown;
    readonly bindings?: Readonly<Record<string, string>>;
}
```

### createMemoryPluginStore

```ts
export declare function createMemoryPluginStore(): PluginStore;
```

### Installation

```ts
export interface Installation {
    readonly id: string;
    readonly version: string;
    readonly artifact?: PluginArtifact;
    readonly package?: PackageArtifact;
    readonly enabled: boolean;
    readonly config: unknown;
    readonly bindings: Readonly<Record<string, string>>;
}
```

### InstallationDocument

```ts
export interface InstallationDocument {
    readonly formatVersion: 1;
    readonly revision: number;
    readonly plugins: readonly Installation[];
    readonly operation?: ManagementOperation;
}
```

### ManagedPluginSnapshot

```ts
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
```

### ManagementAction

```ts
export type ManagementAction = 'install' | 'enable' | 'disable' | 'uninstall' | 'configure' | 'recover';
```

### ManagementOperation

```ts
export interface ManagementOperation {
    readonly id: string;
    readonly action: ManagementAction;
    readonly pluginId: string;
    readonly state: 'pending' | 'failed' | 'succeeded';
    readonly error?: string;
}
```

### PackageArtifact

```ts
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
```

### PackageDeclaration

```ts
export interface PackageDeclaration {
    readonly formatVersion: 1;
    readonly manifest: PluginManifest;
    readonly entries: {
        readonly node?: string;
        readonly browser?: string;
    };
    readonly assets: Readonly<Record<string, string>>;
    readonly shared: readonly string[];
}
```

### packageDigest

```ts
export declare function packageDigest(input: unknown): Promise<string>;
```

### PackageInstallOptions

```ts
export interface PackageInstallOptions {
    readonly acceptTrustedCode: true;
    readonly signal?: AbortSignal;
    readonly onProgress?: (phase: 'installing' | 'validating' | 'stored') => void;
}
```

### PluginArtifact

```ts
export interface PluginArtifact {
    readonly formatVersion: 1;
    readonly manifest: PluginManifest;
    readonly entries: {
        readonly browser?: string;
        readonly node?: string;
    };
    readonly assets: readonly {
        readonly id: string;
        readonly type: 'text/css' | 'text/plain';
        readonly source: string;
    }[];
    readonly integrity: string;
}
```

### PluginManager

```ts
export interface PluginManager {
    inspect(): PluginManagerSnapshot;
    subscribe(listener: (snapshot: PluginManagerSnapshot) => void): Cleanup;
    configuration(id: string): Readonly<{
        config: unknown;
        bindings: Readonly<Record<string, string>>;
    }>;
    /** 从权威安装库重新读取并协调本实例；不覆盖其他实例的持久意愿。 */
    refresh(): Promise<PluginManagerSnapshot>;
    /** 不执行入口；acceptedIntegrity 必须由可信调用方对精确包内容明确确认。 */
    install(input: unknown, options: {
        readonly acceptedIntegrity: string;
        readonly config?: unknown;
        readonly bindings?: Readonly<Record<string, string>>;
    }): Promise<PluginManagerSnapshot>;
    installPackage(input: unknown, options: PackageInstallOptions & {
        readonly config?: unknown;
        readonly bindings?: Readonly<Record<string, string>>;
    }): Promise<PluginManagerSnapshot>;
    enable(id: string): Promise<PluginManagerSnapshot>;
    disable(id: string): Promise<PluginManagerSnapshot>;
    /** 默认保留应用用户数据；依赖仍存在时拒绝卸载。 */
    uninstall(id: string): Promise<PluginManagerSnapshot>;
    /** restart=true 显式保存新配置和启用意愿，再停止旧实例并重建；默认只允许停用项改配置。 */
    configure(id: string, options: {
        readonly config: unknown;
        readonly bindings: Readonly<Record<string, string>>;
        readonly restart?: boolean;
        /** 表单读取时的修订号；避免同步后仍用旧草稿覆盖其他页面。 */
        readonly expectedRevision?: number;
    }): Promise<PluginManagerSnapshot>;
    /** 拒绝新操作并等待已接纳操作，用于宿主先排空请求、再释放插件。 */
    drain(): Promise<void>;
    /** 停止接收新操作、排空已提交操作并等待真实运行时清理；不修改启停意愿。 */
    close(): Promise<PluginManagerSnapshot>;
}
```

### PluginManagerOptions

```ts
export interface PluginManagerOptions {
    readonly runtime: Runtime;
    readonly store: PluginStore;
    readonly loader: PluginModuleLoader;
    readonly environment: HostEnvironment;
    readonly builtins?: readonly BuiltinPlugin[];
    readonly packages?: PluginPackageRepository;
    /** 仅全新安装库调用；应用提供旧配置映射，框架校验并一次性持久提交。 */
    readonly initialize?: () => readonly {
        readonly id: string;
        readonly enabled: boolean;
        readonly config: unknown;
        readonly bindings: Readonly<Record<string, string>>;
    }[] | Promise<readonly {
        readonly id: string;
        readonly enabled: boolean;
        readonly config: unknown;
        readonly bindings: Readonly<Record<string, string>>;
    }[]>;
}
```

### PluginManagerSnapshot

```ts
export interface PluginManagerSnapshot {
    readonly revision: number;
    readonly closed: boolean;
    readonly ready: boolean;
    readonly plugins: readonly ManagedPluginSnapshot[];
    readonly operation?: ManagementOperation;
    readonly diagnostics: readonly string[];
}
```

### PluginModuleLease

```ts
export interface PluginModuleLease {
    readonly plugin: RegisteredPlugin;
    release(): void | Promise<void>;
}
```

### PluginModuleLoader

```ts
export interface PluginModuleLoader {
    load(artifact: PluginArtifact, environment: HostEnvironment): Promise<PluginModuleLease>;
    close?(): void | Promise<void>;
}
```

### PluginPackageRepository

```ts
export interface PluginPackageRepository {
    recover(installed: readonly PackageArtifact[]): Promise<void>;
    stage(input: unknown, options: PackageInstallOptions): Promise<PackageArtifact>;
    validate(artifact: PackageArtifact, environment: HostEnvironment): Promise<void>;
    load(artifact: PackageArtifact, environment: HostEnvironment): Promise<PluginModuleLease>;
    remove(artifact: PackageArtifact): Promise<void>;
    close(): Promise<void>;
}
```

### PluginStore

```ts
export interface PluginStore {
    acquire(): Promise<Cleanup>;
    read(): Promise<unknown | undefined>;
    write(expectedRevision: number, document: InstallationDocument): Promise<void>;
    exclusive?<T>(operation: () => Promise<T>): Promise<T>;
    subscribe?(listener: () => void): Cleanup;
}
```

### startPluginManager

```ts
export declare function startPluginManager(options: PluginManagerOptions): Promise<PluginManager>;
```

### validateArtifact

```ts
export declare function validateArtifact(input: unknown, environment?: HostEnvironment): Promise<PluginArtifact>;
```

### validateBrowserPackage

```ts
export declare function validateBrowserPackage(input: unknown): Promise<BrowserPackage>;
```

### validatePackageDeclaration

```ts
export declare function validatePackageDeclaration(input: unknown, environment?: HostEnvironment): PackageDeclaration;
```

## cordis-web-framework/contracts/management

导出：`BuiltinPlugin`、`Installation`、`InstallationDocument`、`ManagedPluginSnapshot`、`ManagementAction`、`ManagementOperation`、`PluginArtifact`、`PluginManager`、`PluginManagerOptions`、`PluginManagerSnapshot`、`PluginModuleLease`、`PluginModuleLoader`、`PluginStore`。

### BuiltinPlugin

```ts
export interface BuiltinPlugin {
    readonly plugin: RegisteredPlugin;
    readonly enabled?: boolean;
    readonly required?: boolean;
    readonly config?: unknown;
    readonly bindings?: Readonly<Record<string, string>>;
}
```

### Installation

```ts
export interface Installation {
    readonly id: string;
    readonly version: string;
    readonly artifact?: PluginArtifact;
    readonly package?: PackageArtifact;
    readonly enabled: boolean;
    readonly config: unknown;
    readonly bindings: Readonly<Record<string, string>>;
}
```

### InstallationDocument

```ts
export interface InstallationDocument {
    readonly formatVersion: 1;
    readonly revision: number;
    readonly plugins: readonly Installation[];
    readonly operation?: ManagementOperation;
}
```

### ManagedPluginSnapshot

```ts
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
```

### ManagementAction

```ts
export type ManagementAction = 'install' | 'enable' | 'disable' | 'uninstall' | 'configure' | 'recover';
```

### ManagementOperation

```ts
export interface ManagementOperation {
    readonly id: string;
    readonly action: ManagementAction;
    readonly pluginId: string;
    readonly state: 'pending' | 'failed' | 'succeeded';
    readonly error?: string;
}
```

### PluginArtifact

```ts
export interface PluginArtifact {
    readonly formatVersion: 1;
    readonly manifest: PluginManifest;
    readonly entries: {
        readonly browser?: string;
        readonly node?: string;
    };
    readonly assets: readonly {
        readonly id: string;
        readonly type: 'text/css' | 'text/plain';
        readonly source: string;
    }[];
    readonly integrity: string;
}
```

### PluginManager

```ts
export interface PluginManager {
    inspect(): PluginManagerSnapshot;
    subscribe(listener: (snapshot: PluginManagerSnapshot) => void): Cleanup;
    configuration(id: string): Readonly<{
        config: unknown;
        bindings: Readonly<Record<string, string>>;
    }>;
    /** 从权威安装库重新读取并协调本实例；不覆盖其他实例的持久意愿。 */
    refresh(): Promise<PluginManagerSnapshot>;
    /** 不执行入口；acceptedIntegrity 必须由可信调用方对精确包内容明确确认。 */
    install(input: unknown, options: {
        readonly acceptedIntegrity: string;
        readonly config?: unknown;
        readonly bindings?: Readonly<Record<string, string>>;
    }): Promise<PluginManagerSnapshot>;
    installPackage(input: unknown, options: PackageInstallOptions & {
        readonly config?: unknown;
        readonly bindings?: Readonly<Record<string, string>>;
    }): Promise<PluginManagerSnapshot>;
    enable(id: string): Promise<PluginManagerSnapshot>;
    disable(id: string): Promise<PluginManagerSnapshot>;
    /** 默认保留应用用户数据；依赖仍存在时拒绝卸载。 */
    uninstall(id: string): Promise<PluginManagerSnapshot>;
    /** restart=true 显式保存新配置和启用意愿，再停止旧实例并重建；默认只允许停用项改配置。 */
    configure(id: string, options: {
        readonly config: unknown;
        readonly bindings: Readonly<Record<string, string>>;
        readonly restart?: boolean;
        /** 表单读取时的修订号；避免同步后仍用旧草稿覆盖其他页面。 */
        readonly expectedRevision?: number;
    }): Promise<PluginManagerSnapshot>;
    /** 拒绝新操作并等待已接纳操作，用于宿主先排空请求、再释放插件。 */
    drain(): Promise<void>;
    /** 停止接收新操作、排空已提交操作并等待真实运行时清理；不修改启停意愿。 */
    close(): Promise<PluginManagerSnapshot>;
}
```

### PluginManagerOptions

```ts
export interface PluginManagerOptions {
    readonly runtime: Runtime;
    readonly store: PluginStore;
    readonly loader: PluginModuleLoader;
    readonly environment: HostEnvironment;
    readonly builtins?: readonly BuiltinPlugin[];
    readonly packages?: PluginPackageRepository;
    /** 仅全新安装库调用；应用提供旧配置映射，框架校验并一次性持久提交。 */
    readonly initialize?: () => readonly {
        readonly id: string;
        readonly enabled: boolean;
        readonly config: unknown;
        readonly bindings: Readonly<Record<string, string>>;
    }[] | Promise<readonly {
        readonly id: string;
        readonly enabled: boolean;
        readonly config: unknown;
        readonly bindings: Readonly<Record<string, string>>;
    }[]>;
}
```

### PluginManagerSnapshot

```ts
export interface PluginManagerSnapshot {
    readonly revision: number;
    readonly closed: boolean;
    readonly ready: boolean;
    readonly plugins: readonly ManagedPluginSnapshot[];
    readonly operation?: ManagementOperation;
    readonly diagnostics: readonly string[];
}
```

### PluginModuleLease

```ts
export interface PluginModuleLease {
    readonly plugin: RegisteredPlugin;
    release(): void | Promise<void>;
}
```

### PluginModuleLoader

```ts
export interface PluginModuleLoader {
    load(artifact: PluginArtifact, environment: HostEnvironment): Promise<PluginModuleLease>;
    close?(): void | Promise<void>;
}
```

### PluginStore

```ts
export interface PluginStore {
    acquire(): Promise<Cleanup>;
    read(): Promise<unknown | undefined>;
    write(expectedRevision: number, document: InstallationDocument): Promise<void>;
    exclusive?<T>(operation: () => Promise<T>): Promise<T>;
    subscribe?(listener: () => void): Cleanup;
}
```

## cordis-web-framework/hosts/node/plugins

导出：`createNodePackageRepository`、`createNodePluginLoader`、`createNodePluginStore`、`NodePackageRepositoryOptions`、`NodePackageSource`。

### createNodePackageRepository

```ts
export declare function createNodePackageRepository(options: NodePackageRepositoryOptions): PluginPackageRepository & {
    exportBrowser(artifact: PackageArtifact): Promise<BrowserPackage>;
};
```

### createNodePluginLoader

```ts
export declare function createNodePluginLoader(): PluginModuleLoader;
```

### createNodePluginStore

```ts
export declare function createNodePluginStore(filename: string): PluginStore;
```

### NodePackageRepositoryOptions

```ts
export interface NodePackageRepositoryOptions extends NpmRunnerOptions {
    readonly directory: string;
    readonly shared?: Readonly<Record<string, unknown>>;
}
```

### NodePackageSource

```ts
export type NodePackageSource = {
    readonly type: 'file';
    readonly path: string;
} | {
    readonly type: 'registry';
    readonly name: string;
    readonly version: string;
    readonly registry?: string;
};
```

## cordis-web-framework/hosts/browser/plugins

导出：`createBrowserPackageRepository`、`createBrowserPluginLoader`、`createBrowserPluginResources`、`createBrowserPluginStore`。

### createBrowserPackageRepository

```ts
export declare function createBrowserPackageRepository(options?: {
    readonly shared?: Readonly<Record<string, unknown>>;
}): PluginPackageRepository;
```

### createBrowserPluginLoader

```ts
export declare function createBrowserPluginLoader(): PluginModuleLoader;
```

### createBrowserPluginResources

```ts
export declare function createBrowserPluginResources(target?: Element): Readonly<{
    style(scope: Pick<PluginScope, "onDispose">, id: string, css: string): void;
    asset(scope: Pick<PluginScope, "onDispose">, resource: PluginArtifact["assets"][number]): string;
}>;
```

### createBrowserPluginStore

```ts
export declare function createBrowserPluginStore(name: string): PluginStore;
```

## cordis-web-framework/presentation-vue/catalog

导出：`createVueViewCatalog`。

### createVueViewCatalog

```ts
export declare function createVueViewCatalog(initial?: ReadonlyMap<string, Component>): Readonly<{
    views: ReadonlyMap<string, Component>;
    register(scope: Pick<PluginScope, "onDispose">, id: string, component: Component): Cleanup;
    inspect(): Readonly<{
        views: number;
    }>;
}>;
```

## cordis-web-framework/http-json/registry

导出：`createJsonEndpointRegistry`、`createStaticAssetRegistry`。

### createJsonEndpointRegistry

```ts
export declare function createJsonEndpointRegistry(): Readonly<{
    register(endpoint: JsonEndpoint): Cleanup;
    execute(method: string, path: string, context: ApiRequestContext, body: unknown): Promise<unknown>;
    inspect(): Readonly<{
        endpoints: number;
        active: number;
    }>;
}>;
```

### createStaticAssetRegistry

```ts
export declare function createStaticAssetRegistry(): Readonly<{
    register(input: StaticAsset): Cleanup;
    get(path: string): StaticAsset | undefined;
    inspect(): Readonly<{
        assets: number;
    }>;
}>;
```

## cordis-web-framework/ui

导出：`createUiRegistry`、`resolveUiPosition`、`UiAccess`、`UiContext`、`UiContribution`、`UiDiagnostic`、`UiError`、`UiHandle`、`UiKind`、`UiLease`、`UiPosition`、`UiPositions`、`UiRegistry`、`UiResolution`、`UiScope`、`UiSelection`、`UiSnapshot`。

### createUiRegistry

```ts
export declare function createUiRegistry(options?: {
    onDiagnostic?: (diagnostic: UiDiagnostic) => void;
}): UiRegistry;
```

### resolveUiPosition

```ts
export declare function resolveUiPosition<K extends keyof UiPositions & string>(registry: UiRegistry, target: K, context: Omit<UiContext, 'props'> & {
    readonly props: UiPositions[K];
}, request?: {
    access?: UiAccess;
    entryKey?: string;
}): import("./index.ts").UiResolution;
```

### UiAccess

```ts
export interface UiAccess {
    readonly owner: number;
}
```

### UiContext

```ts
export interface UiContext {
    readonly scope: 'root' | 'session';
    readonly sessionId?: string;
    readonly props: Readonly<Record<string, unknown>>;
}
```

### UiContribution

```ts
export interface UiContribution {
    readonly id: string;
    readonly target: string;
    readonly range: string;
    readonly renderer: string;
    readonly view: string;
    readonly key?: string;
    readonly priority?: number;
    readonly order?: number;
    readonly children?: readonly UiPosition[];
    readonly select?: (props: Readonly<Record<string, unknown>>) => unknown | null;
}
```

### UiDiagnostic

```ts
export interface UiDiagnostic {
    readonly code: 'conflict' | 'undeclared' | 'incompatible' | 'scope' | 'unauthorized' | 'render-failed' | 'selector-failed' | 'observer-failed' | 'wait-failed' | 'cleanup-failed';
    readonly target: string;
    readonly contributionId?: string;
}
```

### UiError

```ts
export declare class UiError extends Error {
    readonly diagnostic: UiDiagnostic;
    constructor(diagnostic: UiDiagnostic);
}
```

### UiHandle

```ts
export interface UiHandle extends UiLease {
    readonly children: UiAccess;
}
```

### UiKind

```ts
export type UiKind = 'single' | 'list' | 'keyed' | 'chain';
```

### UiLease

```ts
export interface UiLease {
    readonly instance: number;
    readonly id: string;
    dispose(): void;
}
```

### UiPosition

```ts
export interface UiPosition {
    readonly name: string;
    readonly kind: UiKind;
    readonly scope: UiScope;
    readonly version: string;
}
```

### UiPositions

```ts
export interface UiPositions {
    root: Record<string, unknown>;
}
```

### UiRegistry

```ts
export interface UiRegistry {
    register<K extends keyof UiPositions & string>(spec: Omit<UiContribution, 'target'> & {
        readonly target: K;
    }): UiHandle;
    /** 动态模块的同一运行时校验入口；类型化应用优先使用 register。 */
    registerDynamic(spec: UiContribution): UiHandle;
    inject(target: string, install: () => (() => void)): () => void;
    resolve(target: string, context: UiContext, options?: {
        access?: UiAccess;
        entryKey?: string;
    }): UiResolution;
    fail(instance: number, sessionId?: string): void;
    releaseSession(sessionId: string): void;
    inspect(): UiSnapshot;
    subscribe(listener: () => void): () => void;
    close(): void;
}
```

### UiResolution

```ts
export interface UiResolution {
    readonly entries: readonly UiSelection[];
    readonly failed: boolean;
    readonly kind: UiKind;
    /** 列表中的某一单元失败不应吞掉其他单元，也不能伪装成自然空白。 */
    readonly failedUnits: readonly string[];
}
```

### UiScope

```ts
export type UiScope = 'root' | 'session-maybe' | 'session';
```

### UiSelection

```ts
export interface UiSelection {
    readonly instance: number;
    readonly contribution: UiContribution;
    readonly children: UiAccess;
    readonly matched?: unknown;
}
```

### UiSnapshot

```ts
export interface UiSnapshot {
    readonly version: number;
    readonly positions: readonly string[];
    readonly contributions: number;
    readonly waiters: number;
    readonly observers: number;
    readonly closed: boolean;
    readonly cleanupFailures: number;
    readonly diagnostics: readonly UiDiagnostic[];
}
```

## cordis-web-framework/contracts/ui

导出：`UiAccess`、`UiContext`、`UiContribution`、`UiDiagnostic`、`UiHandle`、`UiKind`、`UiLease`、`UiPosition`、`UiPositions`、`UiRegistry`、`UiResolution`、`UiScope`、`UiSelection`、`UiSnapshot`。

### UiAccess

```ts
export interface UiAccess {
    readonly owner: number;
}
```

### UiContext

```ts
export interface UiContext {
    readonly scope: 'root' | 'session';
    readonly sessionId?: string;
    readonly props: Readonly<Record<string, unknown>>;
}
```

### UiContribution

```ts
export interface UiContribution {
    readonly id: string;
    readonly target: string;
    readonly range: string;
    readonly renderer: string;
    readonly view: string;
    readonly key?: string;
    readonly priority?: number;
    readonly order?: number;
    readonly children?: readonly UiPosition[];
    readonly select?: (props: Readonly<Record<string, unknown>>) => unknown | null;
}
```

### UiDiagnostic

```ts
export interface UiDiagnostic {
    readonly code: 'conflict' | 'undeclared' | 'incompatible' | 'scope' | 'unauthorized' | 'render-failed' | 'selector-failed' | 'observer-failed' | 'wait-failed' | 'cleanup-failed';
    readonly target: string;
    readonly contributionId?: string;
}
```

### UiHandle

```ts
export interface UiHandle extends UiLease {
    readonly children: UiAccess;
}
```

### UiKind

```ts
export type UiKind = 'single' | 'list' | 'keyed' | 'chain';
```

### UiLease

```ts
export interface UiLease {
    readonly instance: number;
    readonly id: string;
    dispose(): void;
}
```

### UiPosition

```ts
export interface UiPosition {
    readonly name: string;
    readonly kind: UiKind;
    readonly scope: UiScope;
    readonly version: string;
}
```

### UiPositions

```ts
export interface UiPositions {
    root: Record<string, unknown>;
}
```

### UiRegistry

```ts
export interface UiRegistry {
    register<K extends keyof UiPositions & string>(spec: Omit<UiContribution, 'target'> & {
        readonly target: K;
    }): UiHandle;
    /** 动态模块的同一运行时校验入口；类型化应用优先使用 register。 */
    registerDynamic(spec: UiContribution): UiHandle;
    inject(target: string, install: () => (() => void)): () => void;
    resolve(target: string, context: UiContext, options?: {
        access?: UiAccess;
        entryKey?: string;
    }): UiResolution;
    fail(instance: number, sessionId?: string): void;
    releaseSession(sessionId: string): void;
    inspect(): UiSnapshot;
    subscribe(listener: () => void): () => void;
    close(): void;
}
```

### UiResolution

```ts
export interface UiResolution {
    readonly entries: readonly UiSelection[];
    readonly failed: boolean;
    readonly kind: UiKind;
    /** 列表中的某一单元失败不应吞掉其他单元，也不能伪装成自然空白。 */
    readonly failedUnits: readonly string[];
}
```

### UiScope

```ts
export type UiScope = 'root' | 'session-maybe' | 'session';
```

### UiSelection

```ts
export interface UiSelection {
    readonly instance: number;
    readonly contribution: UiContribution;
    readonly children: UiAccess;
    readonly matched?: unknown;
}
```

### UiSnapshot

```ts
export interface UiSnapshot {
    readonly version: number;
    readonly positions: readonly string[];
    readonly contributions: number;
    readonly waiters: number;
    readonly observers: number;
    readonly closed: boolean;
    readonly cleanupFailures: number;
    readonly diagnostics: readonly UiDiagnostic[];
}
```

## cordis-web-framework/commands

导出：`CommandContext`、`CommandDefinition`、`CommandRegistry`、`CommandResult`、`createCommandRegistry`。

### CommandContext

```ts
export interface CommandContext {
    readonly sessionId?: string;
}
```

### CommandDefinition

```ts
export interface CommandDefinition {
    readonly id: string;
    readonly label: string;
    readonly shortcut?: {
        readonly key: string;
        readonly mod?: boolean;
        readonly shift?: boolean;
        readonly allowInput?: boolean;
    };
    readonly enabled?: (context: CommandContext) => boolean;
    readonly run: (context: CommandContext, signal: AbortSignal) => void | Promise<void>;
}
```

### CommandRegistry

```ts
export interface CommandRegistry {
    /** 撤销立即禁止新调用并发送取消；返回值等待本命令真实在途动作结束。 */
    register(command: CommandDefinition): () => Promise<void>;
    list(): readonly CommandDefinition[];
    enabled(id: string, context: CommandContext): boolean;
    execute(id: string, context: CommandContext): Promise<CommandResult>;
    subscribe(listener: () => void): () => void;
    inspect(): {
        readonly commands: number;
        readonly running: number;
        readonly failures: readonly string[];
    };
    close(): Promise<void>;
}
```

### CommandResult

```ts
export type CommandResult = 'completed' | 'disabled' | 'missing' | 'busy' | 'cancelled' | 'failed';
```

### createCommandRegistry

```ts
export declare function createCommandRegistry(): CommandRegistry;
```

## cordis-web-framework/contracts/commands

导出：`CommandContext`、`CommandDefinition`、`CommandRegistry`、`CommandResult`。

### CommandContext

```ts
export interface CommandContext {
    readonly sessionId?: string;
}
```

### CommandDefinition

```ts
export interface CommandDefinition {
    readonly id: string;
    readonly label: string;
    readonly shortcut?: {
        readonly key: string;
        readonly mod?: boolean;
        readonly shift?: boolean;
        readonly allowInput?: boolean;
    };
    readonly enabled?: (context: CommandContext) => boolean;
    readonly run: (context: CommandContext, signal: AbortSignal) => void | Promise<void>;
}
```

### CommandRegistry

```ts
export interface CommandRegistry {
    /** 撤销立即禁止新调用并发送取消；返回值等待本命令真实在途动作结束。 */
    register(command: CommandDefinition): () => Promise<void>;
    list(): readonly CommandDefinition[];
    enabled(id: string, context: CommandContext): boolean;
    execute(id: string, context: CommandContext): Promise<CommandResult>;
    subscribe(listener: () => void): () => void;
    inspect(): {
        readonly commands: number;
        readonly running: number;
        readonly failures: readonly string[];
    };
    close(): Promise<void>;
}
```

### CommandResult

```ts
export type CommandResult = 'completed' | 'disabled' | 'missing' | 'busy' | 'cancelled' | 'failed';
```

## cordis-web-framework/contracts/navigation

导出：`UiNavigation`、`UiRoute`、`UiTheme`。

### UiNavigation

```ts
export interface UiNavigation {
    readonly id: string;
    readonly label: string;
    readonly routeId: string;
    readonly order?: number;
}
```

### UiRoute

```ts
export interface UiRoute {
    readonly id: string;
    readonly path: string;
    readonly view: string;
}
```

### UiTheme

```ts
export interface UiTheme {
    readonly id: string;
    readonly tokens: Readonly<Record<string, string>>;
}
```

## cordis-web-framework/presentation-vue/ui

导出：`createVueUi`、`VueUiInput`。

### createVueUi

```ts
export declare function createVueUi(options: {
    readonly registry: UiRegistry;
    readonly views: ReadonlyMap<string, Component>;
    readonly onError: (detail: {
        readonly target: string;
        readonly contributionId: string;
    }) => void;
}): Readonly<{
    Root: import("vue").DefineComponent<{}, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
        [key: string]: any;
    }>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<{}> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
    Outlet: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
        target: {
            type: StringConstructor;
            required: true;
        };
        context: {
            type: PropType<UiContext>;
            required: true;
        };
        access: PropType<UiAccess>;
        entryKey: StringConstructor;
        overlayFallback: BooleanConstructor;
    }>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
        [key: string]: any;
    }>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
        target: {
            type: StringConstructor;
            required: true;
        };
        context: {
            type: PropType<UiContext>;
            required: true;
        };
        access: PropType<UiAccess>;
        entryKey: StringConstructor;
        overlayFallback: BooleanConstructor;
    }>> & Readonly<{}>, {
        overlayFallback: boolean;
    }, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
}>;
```

### VueUiInput

```ts
export interface VueUiInput {
    readonly uiContext: UiContext;
    readonly uiAccess: UiAccess;
    readonly matched?: unknown;
}
```

## cordis-web-framework/presentation-vue/routing

导出：`createVueNavigation`、`UiNavigation`、`UiRoute`、`VueNavigation`。

### createVueNavigation

```ts
export declare function createVueNavigation(options: {
    ui: UiRegistry;
    target: string;
    history: 'hash' | 'memory';
    onError: () => void;
}): Readonly<{
    install(app: App): void;
    ready(): Promise<void>;
    register(input: UiRoute): () => void;
    registerNavigation(input: UiNavigation): () => void;
    navigate(id: string): Promise<void>;
    current: () => string | undefined;
    list: () => readonly UiNavigation[];
    path: (id: string) => string | undefined;
    subscribe(listener: () => void): () => void;
    inspect: () => Readonly<{
        routes: number;
        navigation: number;
        listeners: number;
        closed: boolean;
    }>;
    close(): void;
}>;
```

### UiNavigation

```ts
export interface UiNavigation {
    readonly id: string;
    readonly label: string;
    readonly routeId: string;
    readonly order?: number;
}
```

### UiRoute

```ts
export interface UiRoute {
    readonly id: string;
    readonly path: string;
    readonly view: string;
}
```

### VueNavigation

```ts
export type VueNavigation = ReturnType<typeof createVueNavigation>;
```

## cordis-web-framework/presentation-vue/controls

导出：`bindCommandShortcuts`、`createVueTheme`。

### bindCommandShortcuts

```ts
export declare function bindCommandShortcuts(target: HTMLElement, commands: CommandRegistry, context: () => CommandContext): () => void;
```

### createVueTheme

```ts
export declare function createVueTheme(target: HTMLElement): Readonly<{
    register(input: UiTheme): () => void;
    close(): void;
}>;
```

## cordis-web-framework/http-json

导出：`API_STATUS`、`ApiClientError`、`ApiError`、`ApiErrorCode`、`ApiRequestContext`、`createJsonClient`、`defineJsonEndpoint`、`errorEnvelope`、`JSON_BYTE_LIMIT`、`JSON_PROTOCOL_VERSION`、`JsonEndpoint`、`JsonOperation`。

### API_STATUS

```ts
export declare const API_STATUS: Readonly<Record<ApiErrorCode, number>>;
```

### ApiClientError

```ts
export declare class ApiClientError extends Error {
    readonly code: ApiErrorCode | 'network-error' | 'invalid-response';
    readonly requestId?: string;
    constructor(code: ApiClientError['code'], requestId?: string);
}
```

### ApiError

```ts
export declare class ApiError extends Error {
    readonly code: ApiErrorCode;
    constructor(code: ApiErrorCode);
}
```

### ApiErrorCode

```ts
export type ApiErrorCode = 'invalid-input' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'protocol-incompatible' | 'payload-too-large' | 'unsupported-media' | 'cancelled' | 'unavailable' | 'internal-error';
```

### ApiRequestContext

```ts
export interface ApiRequestContext {
    readonly requestId: string;
    readonly credential?: string;
    readonly signal: AbortSignal;
    readonly logger: Logger;
}
```

### createJsonClient

```ts
export declare function createJsonClient(options: {
    readonly baseUrl: string;
    readonly credential?: () => string | undefined;
    readonly fetch?: typeof globalThis.fetch;
}): Readonly<{
    request<I, O>(operation: JsonOperation<I, O>, input: I, signal?: AbortSignal): Promise<{
        data: O;
        requestId: string;
    }>;
}>;
```

### defineJsonEndpoint

```ts
export declare function defineJsonEndpoint<I, O>(operation: JsonOperation<I, O>, handle: (context: ApiRequestContext, input: Readonly<I>) => O | Promise<O>): JsonEndpoint;
```

### errorEnvelope

```ts
export declare function errorEnvelope(requestId: string, code: ApiErrorCode): ApiEnvelope;
```

### JSON_BYTE_LIMIT

```ts
export declare const JSON_BYTE_LIMIT = 65536;
```

### JSON_PROTOCOL_VERSION

```ts
export declare const JSON_PROTOCOL_VERSION = "1";
```

### JsonEndpoint

```ts
export interface JsonEndpoint {
    readonly method: JsonOperation<unknown, unknown>['method'];
    readonly path: string;
    execute(context: ApiRequestContext, body: unknown): Promise<unknown>;
}
```

### JsonOperation

```ts
export interface JsonOperation<I, O> {
    readonly method: 'GET' | 'POST' | 'PUT';
    readonly path: string;
    readonly input: ConfigValidator<I>;
    readonly output: ConfigValidator<O>;
}
```

## cordis-web-framework/contracts/http

导出：`ApiEnvelope`、`ApiErrorCode`、`ApiRequestContext`、`JSON_BYTE_LIMIT`、`JSON_PROTOCOL_VERSION`、`JsonEndpoint`、`JsonOperation`、`StaticAsset`。

### ApiEnvelope

```ts
export type ApiEnvelope = {
    readonly protocol: '1';
    readonly requestId: string;
    readonly ok: true;
    readonly data: unknown;
} | {
    readonly protocol: '1';
    readonly requestId: string;
    readonly ok: false;
    readonly error: {
        readonly code: ApiErrorCode;
    };
};
```

### ApiErrorCode

```ts
export type ApiErrorCode = 'invalid-input' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'protocol-incompatible' | 'payload-too-large' | 'unsupported-media' | 'cancelled' | 'unavailable' | 'internal-error';
```

### ApiRequestContext

```ts
export interface ApiRequestContext {
    readonly requestId: string;
    readonly credential?: string;
    readonly signal: AbortSignal;
    readonly logger: Logger;
}
```

### JSON_BYTE_LIMIT

```ts
export declare const JSON_BYTE_LIMIT = 65536;
```

### JSON_PROTOCOL_VERSION

```ts
export declare const JSON_PROTOCOL_VERSION = "1";
```

### JsonEndpoint

```ts
export interface JsonEndpoint {
    readonly method: JsonOperation<unknown, unknown>['method'];
    readonly path: string;
    execute(context: ApiRequestContext, body: unknown): Promise<unknown>;
}
```

### JsonOperation

```ts
export interface JsonOperation<I, O> {
    readonly method: 'GET' | 'POST' | 'PUT';
    readonly path: string;
    readonly input: ConfigValidator<I>;
    readonly output: ConfigValidator<O>;
}
```

### StaticAsset

```ts
export interface StaticAsset {
    readonly path: string;
    readonly contentType: 'text/html; charset=utf-8' | 'text/javascript; charset=utf-8' | 'text/css; charset=utf-8';
    readonly content: string;
}
```

## cordis-web-framework/hosts/browser

导出：`BrowserHostOptions`、`HostHandle`、`HostOptions`、`HostRuntimeView`、`HostSnapshot`、`HostStartError`、`startBrowserHost`。

### BrowserHostOptions

```ts
export interface BrowserHostOptions extends HostOptions {
    readonly target: Element;
    readonly mount: (target: Element, runtime: HostRuntimeView, onRelease: (cleanup: Cleanup) => void) => void | Promise<void>;
}
```

### HostHandle

```ts
export interface HostHandle {
    readonly management?: PluginManager;
    inspect(): HostSnapshot;
    stop(): Promise<ShutdownSnapshot>;
    completion(): Promise<ShutdownSnapshot>;
}
```

### HostOptions

```ts
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
```

### HostRuntimeView

```ts
export type HostRuntimeView = Pick<Runtime, 'inspect' | 'audit' | 'subscribe'> & {
    readonly management?: PluginManager;
};
```

### HostSnapshot

```ts
export interface HostSnapshot {
    readonly state: HostState;
    readonly environment: HostEnvironment;
    readonly runtime: RuntimeSnapshot;
    readonly error?: string;
}
```

### HostStartError

```ts
export declare class HostStartError extends Error {
    readonly shutdown: ShutdownSnapshot;
    readonly host: HostHandle;
    constructor(cause: unknown, shutdown: ShutdownSnapshot, host: HostHandle);
}
```

### startBrowserHost

```ts
export declare function startBrowserHost(options: BrowserHostOptions): Promise<HostHandle>;
```

## cordis-web-framework/hosts/node

导出：`bindProcessSignals`、`HostHandle`、`HostOptions`、`HostSnapshot`、`HostStartError`、`NodeHost`、`NodeHostOptions`、`startNodeHost`。

### bindProcessSignals

```ts
export declare function bindProcessSignals(host: HostHandle, report: (snapshot: ShutdownSnapshot) => void): () => void;
```

### HostHandle

```ts
export interface HostHandle {
    readonly management?: PluginManager;
    inspect(): HostSnapshot;
    stop(): Promise<ShutdownSnapshot>;
    completion(): Promise<ShutdownSnapshot>;
}
```

### HostOptions

```ts
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
```

### HostSnapshot

```ts
export interface HostSnapshot {
    readonly state: HostState;
    readonly environment: HostEnvironment;
    readonly runtime: RuntimeSnapshot;
    readonly error?: string;
}
```

### HostStartError

```ts
export declare class HostStartError extends Error {
    readonly shutdown: ShutdownSnapshot;
    readonly host: HostHandle;
    constructor(cause: unknown, shutdown: ShutdownSnapshot, host: HostHandle);
}
```

### NodeHost

```ts
export interface NodeHost extends HostHandle {
    readonly address: string;
}
```

### NodeHostOptions

```ts
export interface NodeHostOptions extends HostOptions {
    readonly dynamicApi?: ReturnType<typeof createJsonEndpointRegistry>;
    readonly dynamicAssets?: ReturnType<typeof createStaticAssetRegistry>;
    readonly hostname?: string;
    readonly port?: number;
    readonly routes?: readonly {
        readonly path: string;
        readonly handle: (runtime: HostRuntimeView) => unknown | Promise<unknown>;
    }[];
    readonly api?: readonly JsonEndpoint[];
    readonly assets?: readonly StaticAsset[];
    readonly logger?: Logger;
    readonly maxActiveApiRequests?: number;
}
```

### startNodeHost

```ts
export declare function startNodeHost(options: NodeHostOptions): Promise<NodeHost>;
```

## cordis-web-framework/presentation-vue

导出：`startVueHost`。

### startVueHost

```ts
export declare function startVueHost(options: Omit<BrowserHostOptions, 'mount'> & {
    readonly component: Component;
    readonly props?: (runtime: HostRuntimeView) => Record<string, unknown>;
    readonly configure?: (app: App) => void;
    readonly onError: (error: unknown) => void;
}): Promise<import("../contracts/host.ts").HostHandle>;
```

## cordis-web-framework/contracts/host

导出：`HostHandle`、`HostOptions`、`HostResourceContext`、`HostRuntimeView`、`HostSnapshot`、`HostState`。

### HostHandle

```ts
export interface HostHandle {
    readonly management?: PluginManager;
    inspect(): HostSnapshot;
    stop(): Promise<ShutdownSnapshot>;
    completion(): Promise<ShutdownSnapshot>;
}
```

### HostOptions

```ts
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
```

### HostResourceContext

```ts
export interface HostResourceContext {
    readonly runtime: HostRuntimeView;
    /** 申请资源前登记，确保申请到一半失败也能回收；只允许登记一次。 */
    onRelease(cleanup: Cleanup): void;
}
```

### HostRuntimeView

```ts
export type HostRuntimeView = Pick<Runtime, 'inspect' | 'audit' | 'subscribe'> & {
    readonly management?: PluginManager;
};
```

### HostSnapshot

```ts
export interface HostSnapshot {
    readonly state: HostState;
    readonly environment: HostEnvironment;
    readonly runtime: RuntimeSnapshot;
    readonly error?: string;
}
```

### HostState

```ts
export type HostState = 'ready' | 'not-ready' | Exclude<ShutdownState, 'running'>;
```

## cordis-web-framework

导出：`Cleanup`、`CompositionDocument`、`CompositionIssue`、`CompositionPlan`、`CompositionResult`、`ConfigValidator`、`Diagnostic`、`HostEnvironment`、`PLUGIN_API_VERSION`、`PluginCatalog`、`PluginDefinition`、`PluginHandle`、`PluginManifest`、`PluginScope`、`PluginSnapshot`、`PluginState`、`PreparedPlugin`、`Readiness`、`RegisteredPlugin`、`Runtime`、`RuntimeSnapshot`、`service`、`ServiceKey`、`ValidationIssue`、`ValidationResult`。

### Cleanup

```ts
export type Cleanup = () => void | Promise<void>;
```

### CompositionDocument

```ts
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
```

### CompositionIssue

```ts
export interface CompositionIssue extends ValidationIssue {
    readonly code: 'invalid-document' | 'invalid-manifest' | 'invalid-host-version' | 'duplicate-plugin' | 'module-not-found' | 'identity-mismatch' | 'implementation-mismatch' | 'host-incompatible' | 'config-invalid' | 'duplicate-service' | 'duplicate-requirement' | 'missing-binding' | 'invalid-binding' | 'service-incompatible' | 'dependency-cycle';
    readonly pluginId?: string;
    readonly serviceId?: string;
}
```

### CompositionPlan

```ts
export interface CompositionPlan {
    readonly plugins: readonly PluginManifest[];
    readonly bindings: Readonly<Record<string, string>>;
}
```

### CompositionResult

```ts
export type CompositionResult = {
    readonly ok: true;
    readonly plan: CompositionPlan;
} | {
    readonly ok: false;
    readonly issues: readonly CompositionIssue[];
};
```

### ConfigValidator

```ts
export interface ConfigValidator<T> {
    validate(input: unknown): ValidationResult<T>;
}
```

### Diagnostic

```ts
export interface Diagnostic {
    readonly code: 'activation-failed' | 'cleanup-failed' | 'runtime-error' | 'observer-failed';
    readonly phase: 'activation' | 'cleanup' | 'runtime' | 'observation';
    readonly pluginId?: string;
    readonly instanceId?: string;
    readonly message: string;
}
```

### HostEnvironment

```ts
export interface HostEnvironment {
    readonly platform: 'browser' | 'node';
    readonly capabilities: readonly string[];
}
```

### PLUGIN_API_VERSION

```ts
export declare const PLUGIN_API_VERSION = "1.0.0";
```

### PluginCatalog

```ts
export type PluginCatalog = ReadonlyMap<string, RegisteredPlugin>;
```

### PluginDefinition

```ts
export interface PluginDefinition {
    readonly id: string;
    readonly requires?: readonly ServiceKey[];
    readonly provides?: readonly ServiceKey[];
    setup(scope: PluginScope): void | Promise<void>;
}
```

### PluginHandle

```ts
export interface PluginHandle {
    inspect(): PluginSnapshot;
    /** 等待当前变动收尾；等待依赖的实例也会返回，不能据此判断就绪。 */
    settle(): Promise<PluginSnapshot>;
    /** 等待真实清理完成；清理失败保留在返回快照中，不伪装干净停用。 */
    stop(): Promise<PluginSnapshot>;
}
```

### PluginManifest

```ts
export interface PluginManifest {
    readonly id: string;
    readonly version: string;
    readonly apiVersion: string;
    readonly requires: readonly {
        readonly id: string;
        readonly range: string;
    }[];
    readonly provides: readonly {
        readonly id: string;
        readonly version: string;
    }[];
    readonly host?: {
        readonly platforms: readonly ('browser' | 'node')[];
        readonly capabilities: readonly string[];
    };
}
```

### PluginScope

```ts
export interface PluginScope {
    readonly signal: AbortSignal;
    get<T>(key: ServiceKey<T>): T;
    provide<T>(key: ServiceKey<T>, value: NoInfer<T>): void;
    onDispose(cleanup: Cleanup): void;
}
```

### PluginSnapshot

```ts
export interface PluginSnapshot {
    readonly id: string;
    readonly instanceId: string;
    readonly generation: number;
    readonly state: PluginState;
    readonly waitingFor: readonly string[];
    readonly diagnostics: readonly Diagnostic[];
}
```

### PluginState

```ts
export type PluginState = 'waiting' | 'starting' | 'ready' | 'failed' | 'stopping' | 'stopped' | 'cleanup-failed';
```

### PreparedPlugin

```ts
export interface PreparedPlugin {
    readonly manifest: PluginManifest;
    readonly definition: PluginDefinition;
}
```

### Readiness

```ts
export interface Readiness {
    readonly ready: boolean;
    readonly issues: readonly {
        readonly pluginId: string;
        readonly state: PluginState | 'not-loaded';
        readonly waitingFor: readonly string[];
    }[];
}
```

### RegisteredPlugin

```ts
export interface RegisteredPlugin {
    readonly manifest: PluginManifest;
    prepare(config: unknown): ValidationResult<(scope: PluginScope) => void | Promise<void>>;
}
```

### Runtime

```ts
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
```

### RuntimeSnapshot

```ts
export interface RuntimeSnapshot {
    readonly closed: boolean;
    readonly plugins: readonly PluginSnapshot[];
    readonly diagnostics: readonly Diagnostic[];
}
```

### service

```ts
export declare function service<T>(id: string): ServiceKey<T>;
```

### ServiceKey

```ts
export interface ServiceKey<T = unknown> {
    readonly id: string;
    readonly valueType?: T;
}
```

### ValidationIssue

```ts
export interface ValidationIssue {
    readonly path: readonly (string | number)[];
    readonly message: string;
}
```

### ValidationResult

```ts
export type ValidationResult<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly issues: readonly ValidationIssue[];
};
```

## cordis-web-framework/runtime

导出：`Cleanup`、`Diagnostic`、`PluginDefinition`、`PluginHandle`、`PluginScope`、`PluginSnapshot`、`PluginState`、`Readiness`、`Runtime`、`RuntimeSnapshot`、`service`、`ServiceKey`。

### Cleanup

```ts
export type Cleanup = () => void | Promise<void>;
```

### Diagnostic

```ts
export interface Diagnostic {
    readonly code: 'activation-failed' | 'cleanup-failed' | 'runtime-error' | 'observer-failed';
    readonly phase: 'activation' | 'cleanup' | 'runtime' | 'observation';
    readonly pluginId?: string;
    readonly instanceId?: string;
    readonly message: string;
}
```

### PluginDefinition

```ts
export interface PluginDefinition {
    readonly id: string;
    readonly requires?: readonly ServiceKey[];
    readonly provides?: readonly ServiceKey[];
    setup(scope: PluginScope): void | Promise<void>;
}
```

### PluginHandle

```ts
export interface PluginHandle {
    inspect(): PluginSnapshot;
    /** 等待当前变动收尾；等待依赖的实例也会返回，不能据此判断就绪。 */
    settle(): Promise<PluginSnapshot>;
    /** 等待真实清理完成；清理失败保留在返回快照中，不伪装干净停用。 */
    stop(): Promise<PluginSnapshot>;
}
```

### PluginScope

```ts
export interface PluginScope {
    readonly signal: AbortSignal;
    get<T>(key: ServiceKey<T>): T;
    provide<T>(key: ServiceKey<T>, value: NoInfer<T>): void;
    onDispose(cleanup: Cleanup): void;
}
```

### PluginSnapshot

```ts
export interface PluginSnapshot {
    readonly id: string;
    readonly instanceId: string;
    readonly generation: number;
    readonly state: PluginState;
    readonly waitingFor: readonly string[];
    readonly diagnostics: readonly Diagnostic[];
}
```

### PluginState

```ts
export type PluginState = 'waiting' | 'starting' | 'ready' | 'failed' | 'stopping' | 'stopped' | 'cleanup-failed';
```

### Readiness

```ts
export interface Readiness {
    readonly ready: boolean;
    readonly issues: readonly {
        readonly pluginId: string;
        readonly state: PluginState | 'not-loaded';
        readonly waitingFor: readonly string[];
    }[];
}
```

### Runtime

```ts
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
```

### RuntimeSnapshot

```ts
export interface RuntimeSnapshot {
    readonly closed: boolean;
    readonly plugins: readonly PluginSnapshot[];
    readonly diagnostics: readonly Diagnostic[];
}
```

### service

```ts
export declare function service<T>(id: string): ServiceKey<T>;
```

### ServiceKey

```ts
export interface ServiceKey<T = unknown> {
    readonly id: string;
    readonly valueType?: T;
}
```

## cordis-web-framework/composition

导出：`assembleComposition`、`CompositionRejectedError`、`CompositionStartError`、`definePlugin`、`validateComposition`。

### assembleComposition

```ts
export declare function assembleComposition(document: unknown, catalog: PluginCatalog, options: {
    createRuntime(): Runtime;
    apiVersion?: string;
    environment?: HostEnvironment;
}): Promise<Runtime>;
```

### CompositionRejectedError

```ts
export declare class CompositionRejectedError extends Error {
    readonly issues: readonly CompositionIssue[];
    constructor(issues: readonly CompositionIssue[]);
}
```

### CompositionStartError

```ts
export declare class CompositionStartError extends Error {
    readonly snapshot: RuntimeSnapshot;
    constructor(message: string, snapshot: RuntimeSnapshot);
}
```

### definePlugin

```ts
export declare function definePlugin<T>(options: {
    manifest: PluginManifest;
    config: ConfigValidator<T>;
    setup(scope: PluginScope, config: Readonly<T>): void | Promise<void>;
}): RegisteredPlugin;
```

### validateComposition

```ts
export declare function validateComposition(document: unknown, catalog: PluginCatalog, apiVersion?: string, environment?: HostEnvironment): CompositionResult;
```

## cordis-web-framework/contracts/composition

导出：`CompositionDocument`、`CompositionIssue`、`CompositionPlan`、`CompositionResult`、`ConfigValidator`、`HostEnvironment`、`PLUGIN_API_VERSION`、`PluginCatalog`、`PluginManifest`、`PreparedPlugin`、`RegisteredPlugin`、`ValidationIssue`、`ValidationResult`。

### CompositionDocument

```ts
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
```

### CompositionIssue

```ts
export interface CompositionIssue extends ValidationIssue {
    readonly code: 'invalid-document' | 'invalid-manifest' | 'invalid-host-version' | 'duplicate-plugin' | 'module-not-found' | 'identity-mismatch' | 'implementation-mismatch' | 'host-incompatible' | 'config-invalid' | 'duplicate-service' | 'duplicate-requirement' | 'missing-binding' | 'invalid-binding' | 'service-incompatible' | 'dependency-cycle';
    readonly pluginId?: string;
    readonly serviceId?: string;
}
```

### CompositionPlan

```ts
export interface CompositionPlan {
    readonly plugins: readonly PluginManifest[];
    readonly bindings: Readonly<Record<string, string>>;
}
```

### CompositionResult

```ts
export type CompositionResult = {
    readonly ok: true;
    readonly plan: CompositionPlan;
} | {
    readonly ok: false;
    readonly issues: readonly CompositionIssue[];
};
```

### ConfigValidator

```ts
export interface ConfigValidator<T> {
    validate(input: unknown): ValidationResult<T>;
}
```

### HostEnvironment

```ts
export interface HostEnvironment {
    readonly platform: 'browser' | 'node';
    readonly capabilities: readonly string[];
}
```

### PLUGIN_API_VERSION

```ts
export declare const PLUGIN_API_VERSION = "1.0.0";
```

### PluginCatalog

```ts
export type PluginCatalog = ReadonlyMap<string, RegisteredPlugin>;
```

### PluginManifest

```ts
export interface PluginManifest {
    readonly id: string;
    readonly version: string;
    readonly apiVersion: string;
    readonly requires: readonly {
        readonly id: string;
        readonly range: string;
    }[];
    readonly provides: readonly {
        readonly id: string;
        readonly version: string;
    }[];
    readonly host?: {
        readonly platforms: readonly ('browser' | 'node')[];
        readonly capabilities: readonly string[];
    };
}
```

### PreparedPlugin

```ts
export interface PreparedPlugin {
    readonly manifest: PluginManifest;
    readonly definition: PluginDefinition;
}
```

### RegisteredPlugin

```ts
export interface RegisteredPlugin {
    readonly manifest: PluginManifest;
    prepare(config: unknown): ValidationResult<(scope: PluginScope) => void | Promise<void>>;
}
```

### ValidationIssue

```ts
export interface ValidationIssue {
    readonly path: readonly (string | number)[];
    readonly message: string;
}
```

### ValidationResult

```ts
export type ValidationResult<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly issues: readonly ValidationIssue[];
};
```

## cordis-web-framework/runtime-cordis

导出：`createCordisRuntime`。

### createCordisRuntime

```ts
export declare function createCordisRuntime(): Runtime;
```

## cordis-web-framework/validation-zod

导出：`apiEnvelopeValidator`、`configurationSourcesValidator`、`documentValidator`、`hostEnvironmentValidator`、`hostReadinessValidator`、`jsonObjectValidator`、`manifestValidator`、`nodeListenerValidator`、`uiContributionValidator`、`uiNavigationValidator`、`uiPositionValidator`、`uiRouteValidator`、`uiThemeValidator`、`zodConfig`。

### apiEnvelopeValidator

```ts
export declare const apiEnvelopeValidator: ConfigValidator<ApiEnvelope>;
```

### configurationSourcesValidator

```ts
export declare const configurationSourcesValidator: ConfigValidator<{
    id: string;
    kind: "defaults" | "file" | "environment" | "override";
    values: Record<string, z.core.util.JSONType>;
}[]>;
```

### documentValidator

```ts
export declare const documentValidator: ConfigValidator<{
    formatVersion: 1;
    plugins: {
        id: string;
        version: string;
        entry: string;
        config?: z.core.util.JSONType | undefined;
    }[];
    bindings: Record<string, string>;
}>;
```

### hostEnvironmentValidator

```ts
export declare const hostEnvironmentValidator: ConfigValidator<{
    platform: "browser" | "node";
    capabilities: string[];
}>;
```

### hostReadinessValidator

```ts
export declare const hostReadinessValidator: ConfigValidator<string[]>;
```

### jsonObjectValidator

```ts
export declare const jsonObjectValidator: ConfigValidator<Record<string, z.core.util.JSONType>>;
```

### manifestValidator

```ts
export declare const manifestValidator: ConfigValidator<{
    id: string;
    version: string;
    apiVersion: string;
    requires: {
        id: string;
        range: string;
    }[];
    provides: {
        id: string;
        version: string;
    }[];
    host?: {
        platforms: ("browser" | "node")[];
        capabilities: string[];
    } | undefined;
}>;
```

### nodeListenerValidator

```ts
export declare const nodeListenerValidator: ConfigValidator<{
    hostname: string;
    port: number;
}>;
```

### uiContributionValidator

```ts
export declare const uiContributionValidator: ConfigValidator<{
    id: string;
    target: string;
    range: string;
    renderer: string;
    view: string;
    key?: string | undefined;
    priority?: number | undefined;
    order?: number | undefined;
    children?: {
        name: string;
        kind: "list" | "single" | "keyed" | "chain";
        scope: "root" | "session-maybe" | "session";
        version: string;
    }[] | undefined;
}>;
```

### uiNavigationValidator

```ts
export declare const uiNavigationValidator: ConfigValidator<{
    id: string;
    label: string;
    routeId: string;
    order?: number | undefined;
}>;
```

### uiPositionValidator

```ts
export declare const uiPositionValidator: ConfigValidator<{
    name: string;
    kind: "list" | "single" | "keyed" | "chain";
    scope: "root" | "session-maybe" | "session";
    version: string;
}>;
```

### uiRouteValidator

```ts
export declare const uiRouteValidator: ConfigValidator<{
    id: string;
    view: string;
    path: string;
}>;
```

### uiThemeValidator

```ts
export declare const uiThemeValidator: ConfigValidator<{
    id: string;
    tokens: Record<string, string>;
}>;
```

### zodConfig

```ts
export declare function zodConfig<T>(schema: z.ZodType<T>): ConfigValidator<T>;
```

## cordis-web-framework/version-semver

导出：`isRange`、`isVersion`、`matchesVersion`。

### isRange

```ts
export declare const isRange: (value: string) => boolean;
```

### isVersion

```ts
export declare const isVersion: (value: string) => boolean;
```

### matchesVersion

```ts
export declare const matchesVersion: (version: string, range: string) => boolean;
```

## cordis-web-framework/config

导出：`ConfigurationSnapshot`、`ConfigurationSource`、`resolveConfiguration`。

### ConfigurationSnapshot

```ts
export interface ConfigurationSnapshot<T> {
    readonly value: Readonly<T>;
    /** 顶层字段的最终来源；不复制原始配置和秘密内容。 */
    readonly origins: Readonly<Record<string, string>>;
    readonly sources: readonly {
        readonly id: string;
        readonly kind: ConfigurationSource['kind'];
    }[];
}
```

### ConfigurationSource

```ts
export interface ConfigurationSource {
    readonly id: string;
    readonly kind: 'defaults' | 'file' | 'environment' | 'override';
    readonly values: Readonly<Record<string, unknown>>;
}
```

### resolveConfiguration

```ts
export declare function resolveConfiguration<T extends Record<string, unknown>>(input: unknown, validator: ConfigValidator<T>): ValidationResult<ConfigurationSnapshot<T>>;
```

## cordis-web-framework/logging

导出：`createLogger`、`LogEvent`、`Logger`、`LoggerOptions`、`LogLevel`。

### createLogger

```ts
export declare function createLogger(options?: LoggerOptions): Logger;
```

### LogEvent

```ts
export interface LogEvent {
    readonly time: string;
    readonly level: LogLevel;
    readonly message: string;
    readonly fields: Readonly<Record<string, LogValue>>;
}
```

### Logger

```ts
export interface Logger {
    log(level: LogLevel, message: string, fields?: Readonly<Record<string, unknown>>): void;
    child(context: Readonly<Record<string, unknown>>): Logger;
}
```

### LoggerOptions

```ts
export interface LoggerOptions {
    readonly level?: LogLevel | 'silent';
    readonly context?: Readonly<Record<string, unknown>>;
    readonly write?: (event: LogEvent) => void | Promise<void>;
    /** 异步输出在途上限，超量丢弃并显式通知一次，恢复后允许再次报告拥塞。 */
    readonly maxPendingWrites?: number;
    /** 输出失败通知只提供错误，不重放含敏感数据的原始事件。 */
    readonly onOutputError?: (error: unknown) => void;
}
```

### LogLevel

```ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

## cordis-web-framework/shutdown

导出：`createShutdownController`、`ShutdownController`、`ShutdownSnapshot`、`ShutdownState`。

### createShutdownController

```ts
export declare function createShutdownController(runtime: Runtime, options?: {
    timeoutMs?: number;
}): ShutdownController;
```

### ShutdownController

```ts
export interface ShutdownController {
    inspect(): ShutdownSnapshot;
    /** 发起一次关闭；预算到期可返回 timed-out，但不声称清理完成。重复调用共享结果。 */
    stop(): Promise<ShutdownSnapshot>;
    /** 显式等待真正收尾，可能没有期限；不会解除隔离或重开运行时。 */
    completion(): Promise<ShutdownSnapshot>;
}
```

### ShutdownSnapshot

```ts
export interface ShutdownSnapshot {
    readonly state: ShutdownState;
    readonly runtime: RuntimeSnapshot;
    readonly error?: string;
}
```

### ShutdownState

```ts
export type ShutdownState = 'running' | 'stopping' | 'timed-out' | 'stopped' | 'cleanup-failed';
```

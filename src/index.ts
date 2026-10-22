// 根入口只导出可移植契约，不自动加载 Cordis、日志器或平台实现。
export * from './contracts/runtime.ts';
export type * from './contracts/composition.ts';
export { PLUGIN_API_VERSION } from './contracts/composition.ts';

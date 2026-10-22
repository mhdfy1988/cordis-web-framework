import type { CompositionIssue, CompositionResult, PluginCatalog, HostEnvironment } from '../contracts/composition.ts';
import type { Runtime, RuntimeSnapshot } from '../contracts/runtime.ts';
import { preflight } from './preflight.ts';
export { definePlugin } from './define-plugin.ts';

export class CompositionRejectedError extends Error {
  readonly issues: readonly CompositionIssue[];
  constructor(issues: readonly CompositionIssue[]) {
    super(issues.map(issue => `${issue.code}: ${issue.message}`).join('；'));
    this.name = 'CompositionRejectedError';
    this.issues = issues;
  }
}
export class CompositionStartError extends Error {
  readonly snapshot: RuntimeSnapshot;
  constructor(message: string, snapshot: RuntimeSnapshot) {
    super(message);
    this.name = 'CompositionStartError';
    this.snapshot = snapshot;
  }
}
export function validateComposition(document: unknown, catalog: PluginCatalog, apiVersion?: string, environment?: HostEnvironment): CompositionResult {
  const result = preflight(document, catalog, apiVersion, environment);
  return result.ok ? { ok: true, plan: result.plan } : result;
}

/** 全量预检成功后才创建独立运行时；不接受已有运行时，避免混入未审计的插件。 */
export async function assembleComposition(document: unknown, catalog: PluginCatalog, options: {
  createRuntime(): Runtime;
  apiVersion?: string;
  environment?: HostEnvironment;
}): Promise<Runtime> {
  const result = preflight(document, catalog, options.apiVersion, options.environment);
  if (!result.ok) throw new CompositionRejectedError(result.issues);
  const runtime = options.createRuntime();
  let failure: string;
  try {
    for (const entry of result.prepared) runtime.load(entry.definition);
    await runtime.settle();
    const audit = runtime.audit(result.plan.plugins.map(plugin => plugin.id));
    if (audit.ready) return runtime;
    failure = `装配激活未就绪：${audit.issues.map(issue => `${issue.pluginId} (${issue.state})`).join('、')}`;
  } catch (error) { failure = error instanceof Error ? error.message : String(error); }
  const snapshot = await runtime.close();
  throw new CompositionStartError(failure, snapshot);
}

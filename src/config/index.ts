import type { ConfigValidator, ValidationResult } from '../contracts/composition.ts';
import type { ConfigurationSnapshot, ConfigurationSource } from '../contracts/config.ts';
import { configurationSourcesValidator, jsonObjectValidator } from '../validation-zod/index.ts';
import { freezeData } from '../data/immutable.ts';
export type { ConfigurationSnapshot, ConfigurationSource } from '../contracts/config.ts';

const priority: Record<ConfigurationSource['kind'], number> = { defaults: 0, file: 1, environment: 2, override: 3 };

/** 输入是宿主已解析的来源数据；不在核心读取文件或进程环境。顶层覆盖，不做隐式深合并。 */
export function resolveConfiguration<T extends Record<string, unknown>>(
  input: unknown, validator: ConfigValidator<T>,
): ValidationResult<ConfigurationSnapshot<T>> {
  const parsed = configurationSourcesValidator.validate(input);
  if (!parsed.ok) return { ok: false, issues: freezeData(parsed.issues.map(issue => ({
    ...issue, path: ['sources', ...issue.path],
  }))) };
  const ids = new Set<string>();
  for (const [index, source] of parsed.value.entries()) {
    if (ids.has(source.id)) return { ok: false, issues: freezeData([{
      path: ['sources', index, 'id'], message: '配置来源标识重复',
    }]) };
    ids.add(source.id);
  }
  const sources = parsed.value.toSorted((left, right) => priority[left.kind] - priority[right.kind]);
  const merged: Record<string, unknown> = Object.create(null);
  const origins: Record<string, string> = Object.create(null);
  for (const source of sources) for (const [key, value] of Object.entries(source.values)) {
    merged[key] = value;
    origins[key] = source.id;
  }
  try {
    const configured = validator.validate(merged);
    if (!configured.ok) return { ok: false, issues: freezeData(configured.issues.map(issue => ({
      ...issue, path: ['config', ...issue.path],
    }))) };
    const output = jsonObjectValidator.validate(configured.value);
    if (!output.ok) return { ok: false, issues: freezeData(output.issues.map(issue => ({
      ...issue, path: ['config', ...issue.path],
    }))) };
    const finalOrigins = Object.fromEntries(Object.keys(output.value).map(key => [key, origins[key] ?? 'schema-default']));
    return { ok: true, value: freezeData({ value: output.value as T, origins: finalOrigins,
      sources: sources.map(({ id, kind }) => ({ id, kind })) }) };
  } catch (error) {
    return { ok: false, issues: freezeData([{ path: ['config'],
      message: error instanceof Error ? error.message : String(error) }]) };
  }
}

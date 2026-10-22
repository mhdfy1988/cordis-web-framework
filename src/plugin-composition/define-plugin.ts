import type { ConfigValidator, PluginManifest, RegisteredPlugin } from '../contracts/composition.ts';
import type { PluginScope } from '../contracts/runtime.ts';
import { freezeData } from '../data/immutable.ts';

/** 用闭包保留每个插件配置的类型，装配器不需要接触具体 schema 或配置字段。 */
export function definePlugin<T>(options: {
  manifest: PluginManifest;
  config: ConfigValidator<T>;
  setup(scope: PluginScope, config: Readonly<T>): void | Promise<void>;
}): RegisteredPlugin {
  const setup = options.setup;
  const validator = options.config;
  return Object.freeze({ manifest: options.manifest, prepare(input: unknown) {
    const result = validator.validate(input);
    if (!result.ok) return result;
    const config = freezeData(result.value);
    return { ok: true as const, value: (scope: PluginScope) => setup(scope, config) };
  } });
}

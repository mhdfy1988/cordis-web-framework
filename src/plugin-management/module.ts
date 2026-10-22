import type { PluginArtifact, PluginModuleLease } from '../contracts/management.ts';
import type { RegisteredPlugin } from '../contracts/composition.ts';
import { canonicalJson } from './artifact.ts';

/** 代码已由可信加载适配导入；包清单不能被工厂换成另一身份或服务声明。 */
export function instantiateModule(exports: unknown, artifact: PluginArtifact, release: () => void): PluginModuleLease {
  const factory = (exports as { default?: unknown })?.default;
  if (typeof factory !== 'function') throw new TypeError('插件默认导出必须为工厂');
  const plugin = factory(artifact.manifest, artifact.assets) as RegisteredPlugin;
  if (!plugin || typeof plugin.prepare !== 'function' || canonicalJson(plugin.manifest) !== canonicalJson(artifact.manifest)) {
    throw new TypeError('插件工厂与安装清单不一致');
  }
  return { plugin, release };
}

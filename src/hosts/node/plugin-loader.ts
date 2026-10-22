import type { PluginModuleLoader } from '../../contracts/management.ts';
import { validateArtifact } from '../../plugin-management/artifact.ts';
import { instantiateModule } from '../../plugin-management/module.ts';

export function createNodePluginLoader(): PluginModuleLoader {
  const identity = crypto.randomUUID();
  const versions = new Set<string>();
  return { async load(input, environment) {
    const artifact = await validateArtifact(input, environment);
    if (!versions.has(artifact.integrity) && versions.size >= 128) throw new Error('单加载会话已达 128 个独立代码版本，请关闭后重新打开');
    versions.add(artifact.integrity);
    // 仅此适配允许动态模块地址；不解释清单为本地路径、不执行安装脚本。
    const url = 'data:text/javascript;base64,' + Buffer.from(artifact.entries.node!, 'utf8').toString('base64') + '#' + identity;
    const module = await import(/* @vite-ignore */ url);
    return instantiateModule(module, artifact, () => {});
  } };
}

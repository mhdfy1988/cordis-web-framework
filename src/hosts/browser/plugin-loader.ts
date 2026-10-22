import type { PluginModuleLoader } from '../../contracts/management.ts';
import { validateArtifact } from '../../plugin-management/artifact.ts';
import { instantiateModule } from '../../plugin-management/module.ts';

export function createBrowserPluginLoader(): PluginModuleLoader {
  const modules = new Map<string, { module: unknown; url?: string; references: number }>();
  return { async load(input, environment) {
    const artifact = await validateArtifact(input, environment);
    let cached = modules.get(artifact.integrity);
    if (!cached) {
      if (modules.size >= 128) throw new Error('单加载会话已达 128 个独立代码版本，请关闭后重新打开');
      const url = URL.createObjectURL(new Blob([artifact.entries.browser!], { type: 'text/javascript' }));
      try {
        const module = await import(/* @vite-ignore */ url);
        cached = { module, url, references: 0 }; modules.set(artifact.integrity, cached);
      } catch (error) { URL.revokeObjectURL(url); throw error; }
    }
    cached.references++;
    let open = true;
    const release = () => {
      if (!open) return; open = false;
      if (--cached!.references === 0 && cached!.url) { URL.revokeObjectURL(cached!.url); cached!.url = undefined; }
    };
    try { return instantiateModule(cached.module, artifact, release); } catch (error) { release(); throw error; }
  }, close() { for (const cached of modules.values()) if (cached.url) URL.revokeObjectURL(cached.url); modules.clear(); } };
}

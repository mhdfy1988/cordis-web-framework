import type { Component } from 'vue';
import type { Cleanup, PluginScope } from '../contracts/runtime.ts';

/** 组件目录的修改权受公开注册入口控制；呈现只得到只读 Map。 */
export function createVueViewCatalog(initial: ReadonlyMap<string, Component> = new Map()) {
  const views = new Map(initial);
  const reserved = new Set(initial.keys());
  return Object.freeze({ views: views as ReadonlyMap<string, Component>,
    register(scope: Pick<PluginScope, 'onDispose'>, id: string, component: Component): Cleanup {
      if (!id.trim() || views.has(id) || !component || views.size >= 1024) throw new Error('组件标识无效、冲突或超限');
      views.set(id, component); let open = true;
      const release = () => { if (open) { open = false; if (!reserved.has(id)) views.delete(id); } };
      try { scope.onDispose(release); } catch (error) { release(); throw error; }
      return release;
    },
    inspect() { return Object.freeze({ views: views.size }); },
  });
}

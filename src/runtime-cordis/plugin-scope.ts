import type { Context } from 'cordis';
import type { Cleanup, PluginDefinition, PluginScope } from '../contracts/runtime.ts';

export const serviceName = (id: string) => `cordis-web-framework.service:${id}`;

/** 仅桥接资源登记和声明服务，依赖调度仍由 Cordis 完成。 */
export function createPluginScope(ctx: Context, plugin: PluginDefinition,
  reportCleanup: (error: unknown) => void) {
  const controller = new AbortController();
  const cleanups: Cleanup[] = [];
  const provided = new Set<string>();
  const requires = new Set(plugin.requires?.map(key => key.id));
  const provides = new Set(plugin.provides?.map(key => key.id));
  let open = true;
  let cleaning = false;
  function assertOpen() {
    if (!open) throw new Error('插件作用域已关闭');
  }
  const scope: PluginScope = Object.freeze({
    signal: controller.signal,
    get<T>(key: { id: string }): T {
      assertOpen();
      if (!requires.has(key.id)) throw new Error(`未声明消费服务：${key.id}`);
      // 属性访问使用本轮已绑定依赖；ctx.get 查询当前活动提供者，清理时可能已不可见。
      const value = Reflect.get(ctx, serviceName(key.id));
      if (value === undefined) throw new Error(`服务尚未就绪：${key.id}`);
      return value as T;
    },
    provide<T>(key: { id: string }, value: T) {
      assertOpen();
      if (cleaning || controller.signal.aborted) throw new Error('停用期间不能发布服务');
      if (!provides.has(key.id)) throw new Error(`未声明提供服务：${key.id}`);
      if (provided.has(key.id)) throw new Error(`本轮服务重复发布：${key.id}`);
      if (value === undefined || value === null) throw new Error(`服务值不能为空：${key.id}`);
      ctx.provide(serviceName(key.id), value);
      provided.add(key.id);
    },
    onDispose(cleanup: Cleanup) {
      assertOpen();
      if (cleaning) throw new Error('清理期间不能追加资源');
      if (typeof cleanup !== 'function') throw new TypeError('清理项必须是函数');
      cleanups.push(cleanup);
    },
  });
  return {
    scope,
    abort() { controller.abort(); },
    assertProvided() {
      for (const id of provides) {
        if (!provided.has(id)) throw new Error(`激活结束但未提供声明服务：${id}`);
      }
    },
    async dispose() {
      cleaning = true;
      controller.abort();
      // 单个回调失败不能阻止其余资源释放，错误逐项显式保留。
      try {
        for (const cleanup of cleanups.splice(0).reverse()) {
          try { await cleanup(); } catch (error) { reportCleanup(error); }
        }
      } finally { open = false; }
    },
  };
}

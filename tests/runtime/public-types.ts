import { service } from 'cordis-web-framework/runtime';
import type { PluginScope, Runtime } from 'cordis-web-framework/runtime';

// 只参与类型检查，不运行；错误声明若被意外放宽，tsc 会报告未使用的 expect-error。
function verifyPublicTypes(scope: PluginScope, runtime: Runtime) {
  const key = service<{ read(): number }>('types/probe@1');
  const value: number = scope.get(key).read();
  scope.provide(key, { read: () => value });
  // @ts-expect-error 服务结果类型必须符合契约
  scope.provide(key, { read: () => '错误类型' });
  // @ts-expect-error 作用域不暴露 Cordis 上下文
  scope.ctx;
  // @ts-expect-error 运行句柄不暴露 Fiber
  runtime.load({ id: 'types', setup() {} }).fiber;
  // @ts-expect-error 快照集合不能由消费者写入
  runtime.inspect().plugins.push({});
}

import { service } from 'cordis-web-framework';
import type { Runtime, PluginScope } from 'cordis-web-framework/runtime';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { createLogger } from 'cordis-web-framework/logging';
import { resolveConfiguration } from 'cordis-web-framework/config';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { z } from 'zod';
import { startNodeHost } from 'cordis-web-framework/hosts/node';
import { startBrowserHost } from 'cordis-web-framework/hosts/browser';
import type { HostHandle, HostRuntimeView } from 'cordis-web-framework/contracts/host';
import { createJsonClient, defineJsonEndpoint } from 'cordis-web-framework/http-json';

const op = { method: 'PUT' as const, path: '/api/typed', input: zodConfig(z.strictObject({ value: z.number() })), output: zodConfig(z.string()) };
defineJsonEndpoint(op, (_context, value) => String(value.value));
// @ts-expect-error 网络端点的输出必须满足声明。
defineJsonEndpoint(op, (_context, value) => value.value);
// @ts-expect-error 客户端不能用错误输入调用声明。
createJsonClient({ baseUrl: 'http://localhost' }).request(op, { value: 'bad' });

declare const host: HostHandle;
declare const hostView: HostRuntimeView;
// @ts-expect-error 宿主观察接口不能直接装载插件。
hostView.load({ id: 'invalid', setup() {} });
// @ts-expect-error 宿主状态只读。
host.inspect().state = 'ready';
const startNode: typeof startNodeHost = startNodeHost;
const startBrowser: typeof startBrowserHost = startBrowserHost;
void startNode; void startBrowser;

const runtime: Runtime = createCordisRuntime();
const key = service<{ read(): number }>('typed');
runtime.load({ id: 'typed', provides: [key], setup(scope: PluginScope) {
  scope.provide(key, { read: () => 1 });
  // @ts-expect-error 服务实现不能偷换契约结果类型。
  scope.provide(key, { read: () => 'bad' });
} });
const logger = createLogger();
// @ts-expect-error 第三方日志类型没有泄漏成任意字符串方法。
logger.log('fatal', 'not public');
const parsed = resolveConfiguration([], zodConfig(z.strictObject({ amount: z.number().default(1) })));
if (parsed.ok) {
  const amount: number = parsed.value.value.amount;
  // @ts-expect-error 配置快照顶层不可写。
  parsed.value.value.amount = amount;
}

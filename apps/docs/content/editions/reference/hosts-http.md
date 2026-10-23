# 宿主与 HTTP API

浏览器宿主接入 DOM，Node 宿主接入 HTTP。两者复用装配与清理契约；跨进程数据通过显式 JSON 操作传输，不传服务实例。

## 共同参数与句柄

### 启动参数

| 参数 | 必填／默认 | 用途 |
| --- | --- | --- |
| `document` | 必填 | 装配文档 |
| `catalog` | 必填 | 可信插件目录 |
| `createRuntime` | 必填 | 每次返回新运行时 |
| `shutdownTimeoutMs` | `5000` 毫秒 | 关闭观察预算 |
| `requiredPluginIds` | 全部已装载插件 | 就绪审计名单，必须唯一、有效且已装载 |

只有应用明确允许主动停用可选扩展时才缩小必需名单，不隐藏其他插件故障。HTTP 就绪端点与宿主使用同一名单。

### 宿主句柄

| 方法 | 返回／责任 |
| --- | --- |
| `inspect()` | `state`、`environment`、`runtime` 和可选错误；就绪由实际审计决定 |
| `stop()` | 发起关闭并按预算观察 |
| `completion()` | 发起关闭并等待真实收尾；可能无限等待 |

超时不能提前解除环境资源责任，详见[关闭参考](foundation.md#createshutdowncontroller)。

### 启动错误

- 结构或参数错误：在申请资源前拒绝。
- 装配错误：`CompositionRejectedError`／`CompositionStartError`。
- 环境资源申请失败：`HostStartError`，保留 `shutdown` 和 `host`，可继续观察真实收尾。

不要捕获后静默启动旧宿主来掩盖问题。

## startBrowserHost

### 必填参数

除共同参数外，需要 `target` 和 `mount`。

| 参数 | 约束 |
| --- | --- |
| `target` | 已连接、为空、未被占用的 Element |
| `mount` | 接收容器、只读运行时视图和 `onRelease`，可返回 Promise |

`mount` 必须在申请呈现资源之前登记一次实际清理，重复登记会拒绝。其 Promise 返回，不等于所有异步组件的未来任务已经结束。

### 环境与清理

宿主检测 DOM、fetch 和 `crypto.subtle`，返回 `HostHandle`。正常停止先执行挂载清理、清空容器，再允许重新占用；失败或超时后的脏容器保持隔离。

`HostResourceContext` 提供 `runtime/onRelease` 接线契约。`HostRuntimeView` 只开放 `inspect/audit/subscribe`，呈现层和请求处理器不能因此取得装配控制入口。

> 页面 unload 不能保证等待异步清理，应在应用生命周期中显式 `await host.stop()`。

## startVueHost

在浏览器宿主之上接入 Vue，返回 `Promise<HostHandle>`。消费工程必须显式安装兼容的 Vue peer。

| 参数 | 用途 |
| --- | --- |
| `component` | 必填，应用自己的根组件 |
| `onError` | 必填，运行期错误处理 |
| `props(runtime)` | 可选，提供根组件属性 |
| `configure(app)` | 可选，挂载前安装路由或注入依赖 |

真实应用的接线片段：

```ts
import { startVueHost } from 'cordis-web-framework/presentation-vue';

// target、component、document、catalog、createRuntime 由应用提供。
const host = await startVueHost({
  target, component, document, catalog, createRuntime,
  configure(app) { navigation.install(app); },
  onError: error => console.error('应用呈现失败', error),
});
await navigation.ready();
// 用户退出应用时：
await host.stop();
```

这不是默认后台界面：根组件、侧栏、页头和业务页面由应用／布局插件提供，完整示例见[界面教程](../guide/ui.md)。

同步初次挂载失败会使启动失败；同步卸载失败报告 `cleanup-failed`；运行期错误交给 `onError`。框架不自动登记所有 Vue 异步任务，也不用 `errorHandler` 吞卸载错误来伪装成功。

## startNodeHost 与信号

### 监听与接入

| 参数 | 默认值／限制 |
| --- | --- |
| `hostname` | `127.0.0.1` |
| `port` | `0`，使用实际分配端口 |
| `routes/api/assets` | 空；合计最多 128 条 |
| `logger` | 静默日志器 |
| `maxActiveApiRequests` | `64`，整数 `1—1024` |

返回 `NodeHost`，额外的 `address` 是实际监听地址，不要猜测固定端口。

| 接入类型 | 边界 |
| --- | --- |
| `routes` | 静态 GET `path/handle`，处理器只获得运行时视图 |
| `api` | 经校验的 `JsonEndpoint` |
| `assets` | 固定路径、MIME 和文本内容；只接 HTML／JS／CSS 文本 MIME，单份最多 4MiB |

重复或非法路径拒绝，`/health/ready` 保留。静态资源接入不是通用上传或目录服务器。

### 就绪与停止

`/health/ready` 在真实就绪时返回 `200 {ready:true}`，否则为 `503 {ready:false}`，不输出完整配置。

停止时先拒绝新接入，排空连接和真实 JSON 处理器，再释放插件。可以关闭空闲保活，不强断尚未完成的业务来伪造停止。

### 进程信号

```ts
import { bindProcessSignals } from 'cordis-web-framework/hosts/node';

const unbind = bindProcessSignals(host, result => console.log(result.state));
// 应用主动退出时也应解除监听：
unbind();
await host.stop();
```

监听 `SIGINT/SIGTERM`，首次收到信号后撤销监听并发起停止。失败或超时设置 `process.exitCode = 1`，不强制调用 `process.exit()`。

## JSON 操作、端点与客户端

### 最小示例

在安装当前框架与 Zod 的 Node 24 工程执行 `await runHttpExample()`。它会启动随机回环端口，完成一次真实 HTTP 请求，然后停止服务；不需要数据库或账户。

```ts
import { z } from 'zod';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { startNodeHost } from 'cordis-web-framework/hosts/node';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { createJsonClient, defineJsonEndpoint } from 'cordis-web-framework/http-json';
import type { JsonOperation } from 'cordis-web-framework/contracts/http';

export async function runHttpExample() {
  const shape = zodConfig(z.strictObject({ text: z.string().min(1).max(100) }));
  const operation: JsonOperation<{ text: string }, { text: string }> = {
    method: 'POST', path: '/api/echo', input: shape, output: shape,
  };
  const host = await startNodeHost({
    document: { formatVersion: 1, plugins: [], bindings: {} },
    catalog: new Map(), createRuntime: createCordisRuntime,
    api: [defineJsonEndpoint(operation, (context, input) => {
      context.signal.throwIfAborted();
      return { text: input.text };
    })],
  });
  try {
    const client = createJsonClient({ baseUrl: host.address });
    const result = await client.request(operation, { text: '你好，HTTP' });
    return { data: result.data, hasRequestId: Boolean(result.requestId) };
  } finally {
    const stopped = await host.stop();
    if (stopped.state !== 'stopped') throw new Error('示例服务未干净停止');
  }
}
```

### 预期结果

```json
{ "data": { "text": "你好，HTTP" }, "hasRequestId": true }
```

### 操作与请求参考

| API／类型 | 输入输出 | 边界 |
| --- | --- | --- |
| `JsonOperation<I, O>` | `method/path/input/output` | 方法为 GET／POST／PUT，两端共用校验语义，不传服务实例 |
| `defineJsonEndpoint(operation, handle)` | 异步执行端点 | 处理前检查取消和输入；输出无效为 `internal-error`；业务自己决定副作用提交边界 |
| `ApiRequestContext` | `requestId/credential?/signal/logger` | `credential` 尚未认证，身份与权限归应用 |
| `createJsonClient(options)` | `baseUrl` 必填，`credential/fetch` 可选 | 只接受 HTTP(S) 源地址，不带路径、查询、hash 或内嵌账号 |
| `client.request(operation, input, signal?)` | `Promise<{data, requestId}>` | 校验输入、信封、状态、标识和输出；GET 输入只能空对象 |
| `ApiError(code)` | 服务端受控错误码 | 不把原始异常栈当成响应 |
| `ApiClientError` | `code/requestId?` | 可额外为 `network-error/invalid-response`，取消为 `cancelled` |
| `errorEnvelope(requestId, code)` | 协议错误信封 | 不生成可信身份，标识由服务器调用方提供 |

客户端不自动重试、不发送浏览器 cookies、不跟随重定向。业务认证、权限和跨源策略见[通信教程](../guide/communication.md)。

`0.1.0-rc.2` 起，拒绝响应内容类型、非法 UTF-8 或超量数据时主动取消未读响应流，并释放读取锁；上游取消失败不覆盖原始协议错误，也不等待任意上游收尾。客户端取消仍不表示服务端事务已回滚。

### 协议与状态码

`ApiEnvelope` 是成功数据或安全错误码的辨别联合。`JSON_PROTOCOL_VERSION` 是字符串 `'1'`；`JSON_BYTE_LIMIT` 为 `65536`，计量完整请求／响应 UTF-8 字节，不是字符数。

| 错误码 | HTTP 状态 |
| --- | --- |
| `invalid-input` | 422 |
| `unauthenticated`／`forbidden` | 401／403 |
| `not-found`／`conflict` | 404／409 |
| `protocol-incompatible` | 426 |
| `payload-too-large`／`unsupported-media` | 413／415 |
| `cancelled`／`unavailable` | 499／503 |
| `internal-error` | 500 |

服务端取消只提供信号，不自动回滚事务；客户端丢弃结果不等于服务端没有写入。不要用无条件重试补偿不确定的写入结果。

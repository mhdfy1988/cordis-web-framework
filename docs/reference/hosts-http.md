# 宿主与 HTTP API

## 共同参数与句柄

HostOptions 必填 document、catalog、createRuntime；可选 shutdownTimeoutMs（默认 5000ms）、requiredPluginIds（默认严格检查全部已装载插件）。名单必须唯一有效且已装载；应用仅在允许主动停用可选扩展时显式缩小，其他插件的失败仍可观察。

HostHandle 有 inspect/stop/completion。inspect 返回 state、environment、runtime 和可选 error；ready/not-ready 由实际审计决定。stop 和 completion 的区别同[关闭参考](foundation.md)，超时不会提前清除环境资源责任。HTTP 就绪端点与宿主使用同一必需名单。

错误：结构／参数错误在申请资源前拒绝；装配错误沿用 CompositionRejectedError／CompositionStartError；申请环境资源失败为 HostStartError，含 shutdown 和 host，可继续观察真实收尾。不要捕获后用旧宿主静默替代。

## startBrowserHost

在共同参数外必填 target（已连接、为空、未占用的 Element）和 mount。mount 获得 target、只读 HostRuntimeView、onRelease；必须在申请呈现资源前登记一次实际清理，重复登记拒绝。它可返回 Promise；返回不是全体异步组件未来任务已完成的证明。

环境检测 DOM、fetch、crypto.subtle。返回 HostHandle；正常停止先执行挂载清理，清空容器，再允许重新占用。失败／超时脏容器保持隔离。全局页面 unload 不能保证等待异步关闭，应在应用生命周期显式 await stop。

HostResourceContext 是环境适配接线的 runtime/onRelease 契约，HostRuntimeView 只允许 inspect/audit/subscribe，不让呈现和请求处理器另开装配控制入口。

## startVueHost

替代 mount，必填 Vue component 与 onError；可选 props(runtime) 返回根组件属性、configure(app) 在挂载前接入路由等。返回 `Promise<HostHandle>`。必须显式安装 Vue peer。同步初次挂载失败使宿主启动失败；同步卸载失败报告 cleanup-failed；运行期错误交 onError。框架不承诺 Vue 所有异步任务自动登记清理，不用 errorHandler 吞卸载错误冒充成功。

## startNodeHost 与信号

除共同参数，可选 hostname（127.0.0.1）、port（0）、routes／api／assets（默认空）、logger（默认静默日志器）、maxActiveApiRequests（64，整数 1—1024）。返回 NodeHost，额外 address 为实际监听地址。

routes 为静态 GET path/handle，handle 只获得运行时视图；api 为 JsonEndpoint；assets 为 StaticAsset 的固定 path/contentType/content。合计最多 128 条，健康路径 `/health/ready` 保留；重复／非法路径拒绝。asset 只接受 HTML／JS／CSS 文本 MIME，单份最多 4MiB，不是通用文件上传／目录服务器。

`/health/ready` 返回 200 `{ready:true}` 或 503 `{ready:false}`，不输出完整配置。停止先不接入、排空连接与实际 JSON 处理器，再释放插件。空闲保活可关闭，不强断未结束业务请求来伪造停止。

`bindProcessSignals(host, report)` 订阅 SIGINT/SIGTERM，返回撤销函数；收到首次信号后取消监听并发起 stop，失败／超时设置 process.exitCode=1，不强制 process.exit。手动停止应用时调用方也需撤销监听，避免后续重复接入。

## JSON 操作、端点与客户端

| API／类型 | 参数与返回 | 错误／责任 |
| --- | --- | --- |
| `JsonOperation<I,O>` | method GET/POST/PUT、path、input/output ConfigValidator | 两端共享语义，不传服务实例 |
| defineJsonEndpoint(operation, handle) | 返回 JsonEndpoint，execute 为异步 | 处理前检查取消并验证输入；输出验证失败 internal-error；业务副作用自己决定提交边界 |
| ApiRequestContext | requestId、可选 credential、signal、logger | credential 未认证，身份／权限归应用 |
| createJsonClient(options) | baseUrl 必填 HTTP(S) 源地址；credential/fetch 可选 | 地址不允许路径／查询／hash／内嵌账号；不自动重试、不带浏览器 cookies、不跟随重定向 |
| client.request(operation,input,signal?) | `Promise<{data,requestId}>` | 校验输入、完整信封、状态、标识和输出；GET 输入只能空对象 |
| ApiError(code) | 服务端安全业务错误 | 仅使用受控码，不把异常栈当响应 |
| ApiClientError | code 与可选 requestId | 额外 network-error/invalid-response；取消为 cancelled |
| errorEnvelope(requestId,code) | 构造协议错误信封 | 不自行生成可信身份；调用方提供服务器标识 |

`ApiEnvelope` 为 ok/data 或 error.code 的辨别联合。JSON_PROTOCOL_VERSION=`'1'`，JSON_BYTE_LIMIT=65536，适用于完整 UTF-8 请求／响应；不是字符数量上限。API_STATUS 映射：invalid-input422、unauthenticated401、forbidden403、not-found404、conflict409、protocol-incompatible426、payload-too-large413、unsupported-media415、cancelled499、unavailable503、internal-error500。

服务端请求取消只给信号，不自动回滚事务；客户端丢弃结果也不能断言服务端没有写入。完整实际例见[通信教程](../guide/communication.md)。

自 `0.1.0-rc.2` 起，客户端拒绝内容类型、非法 UTF-8 或超量响应时主动取消尚未读完的数据流，并释放读取锁；不等待上游取消完成，也不以取消错误覆盖原始协议错误。这不代表服务端业务已回滚。

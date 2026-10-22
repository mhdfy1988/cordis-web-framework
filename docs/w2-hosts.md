# W2 两种宿主

日期：2026-10-22。两种宿主已实现并完成本地真实环境与隔离包消费验证；未发布或部署。公共核心不增加 HTTP、DOM 或 Vue 依赖。

W4 接续新增可选 `requiredPluginIds`：应用可显式列出宿主必需插件，允许其他已加载扩展主动停用；缺省仍检查全部插件。宿主快照、资源层缺省审计及 HTTP 就绪端点使用同一范围，可选插件错误仍保留在完整运行快照。初始装配仍全量检查，未知必需插件在宿主资源申请前失败并收尾。行为与新增回归见 [W4](w4-ui.md)，下文 W2 验收数量保留其历史时点。

## 边界与过程

输入是可信插件目录、装配文档、运行时工厂和显式宿主选项。插件清单可声明 `host.platforms` 和 `host.capabilities`；未声明表示可移植插件，不表示安全沙箱。宿主从真实环境提供能力，装配先检查平台／能力，再创建运行时和激活插件。

浏览器宿主拥有挂载容器和呈现资源；服务端宿主拥有 Fastify 实例、监听套接字和可选进程信号订阅。二者不共享运行时、插件状态或配置。宿主不自动读取整个环境变量、不注入服务端配置到 HTML；浏览器只接收应用显式传入的公开配置。任何进入浏览器的值都不能再视为秘密。

启动顺序：预检 → 独立运行时装配 → 实际就绪审计 → 申请宿主资源 → 返回就绪句柄。启动失败先回收已申请资源和运行时，不退回旧实现。运行中 HTTP 就绪检查重新审计插件状态，不把曾启动成功当作一直就绪。

停止顺序：登记幂等关闭句柄并拒绝新接入 → 停止呈现／排空 HTTP → 释放插件。复用 W1 关闭预算：`stop()` 有界，`completion()` 观察实际完成；超时不伪报释放，不能在脏实例上重新启动。资源关闭失败仍尝试释放插件，并明确报告清理失败。浏览器离开页面不保证异步清理执行，需由应用显式调用停止；进程信号订阅显式启用并可撤销，不在库导入时绑定全局状态。

输出只提供宿主状态、运行时只读观察、停止和实际完成；不提供混合用户／请求／插件的万能上下文。W2 不实现身份、数据库、业务请求、跨端协议、布局插槽或完整界面。

## 选型与来源证据

- HTTP 使用 Fastify 5.12.7（MIT）：复用监听、路由、请求生命周期和排空关闭，避免手写 HTTP 路由器。成本是 Node 端运行依赖及其传递依赖；仅 `hosts/node` 适配引用它，公共契约不暴露 Fastify 对象。W2 只提供健康检查和最小显式 GET 路由，不预建业务服务框架。
- 浏览器呈现继续采用 Vue 3.5.44（MIT），通过独立可选适配入口；公共核心与非 Vue 消费者不强制导入。复用现有来源的挂载／卸载思路，不复制 FluidBlock 页面。测试页只展示实例状态和启停操作。
- 真实浏览器验收使用 Playwright 1.64.1（Apache-2.0）开发依赖及本机 Chrome，不安装浏览器，不接用户现有浏览器会话；浏览器构建沿用 esbuild，不为最小宿主再引入一套页面构建工具。
- Fastify 官方 Server 文档：<https://fastify.dev/docs/latest/Reference/Server/>。关注 `listen`、`close`、关闭时拒绝请求和 `forceCloseConnections`；不把强制断连接当作正常排空。
- Vue 官方 Application API：<https://vuejs.org/api/application.html>。关注 `mount`、`unmount`、`errorHandler`；挂载错误必须导致启动失败，卸载属于宿主资源责任。
- Playwright 官方 BrowserType：<https://playwright.dev/docs/api/class-browsertype>。使用 `channel: 'chrome'`，独立上下文和测试服务器。

后续需要流式请求、WebSocket、认证或其他呈现技术时，在各适配边界评估，不扩大公共核心。上述来源是 API 依据，不等同于本项目已验证。

## 公开入口与使用契约

| 入口 | 输入与输出 | 责任 |
| --- | --- | --- |
| `cordis-web-framework/contracts/host` | 宿主选项、只读运行时视图、状态与句柄类型 | 不导入平台或第三方类型 |
| `cordis-web-framework/hosts/browser` | `startBrowserHost({ document, catalog, createRuntime, target, mount, shutdownTimeoutMs? })` → 宿主句柄 | 预留独立空容器、挂载、撤销与占用保护 |
| `cordis-web-framework/presentation-vue` | `startVueHost({ ...浏览器选项, component, props?, onError })` → 宿主句柄 | Vue 创建、初次错误、卸载与错误通知 |
| `cordis-web-framework/hosts/node` | `startNodeHost({ document, catalog, createRuntime, hostname?, port?, routes?, shutdownTimeoutMs? })` → 带 `address` 的宿主句柄 | 监听、就绪、GET 路由、排空与释放 |

`document` 是装配文档，不是 DOM 文档。`catalog` 仍是可信模块目录；`createRuntime` 显式传入公开 Cordis 适配工厂。两种宿主分别调用一次，就有两份独立运行时；没有共享单例和跨端内存通道。

插件清单可增加：

```ts
host: { platforms: ['browser'], capabilities: ['dom', 'fetch'] }
```

浏览器按当前环境检测 `dom`、`fetch` 和 `crypto`（SubtleCrypto）；Node 24 宿主提供 `http`、`crypto`。这里的能力表示可用性，不是服务依赖声明，不替代 `requires`／`provides`，也不是限制可信代码访问操作系统的权限机制。直接调用无宿主的装配器加载带平台要求的插件时，也必须提供匹配的 `environment`，否则拒绝。

浏览器 `mount(target, runtimeView, onRelease)` 在申请呈现资源前登记一次清理函数。`runtimeView` 只有 `inspect`、`audit`、`subscribe`，不能直接加载或关闭运行时。容器必须已连接、为空且没有被本适配占用；并发启动不能争抢同一容器。停止成功后可新建实例重新挂载；超时或失败时不能静默复用。

Vue 是可选 peer 依赖；仅使用浏览器宿主或无界面核心时无需安装 Vue，使用 Vue 呈现入口时由应用安装匹配版本。首次同步呈现错误导致启动失败并清理；同步卸载错误报告 `cleanup-failed`。运行期和异步 Vue 错误交给必填 `onError`，目前不提供错误边界 UI，也不把异步组件自身的 Promise 当作宿主就绪条件；异步资源须通过插件作用域或显式清理函数管理。

Node 默认 `127.0.0.1`、端口 `0`（系统分配）；`hostname` 在适配内部映射为 Fastify `host`。显式 GET 路由最多 128 条，仅接受无参数静态路径，重复路径与保留的 `/health/ready` 在激活前拒绝。路由处理器只获得运行时视图，不获得 Fastify 或自动用户身份；异常响应固定为 500 的 `{ error: 'internal-error' }`，不回传内部异常内容。请求输入／认证／数据写入属于 W3，不通过这些 GET 处理器冒充已实现。

`/health/ready` 当前审计就绪时返回 200／`{ ready: true }`，失去就绪时返回 503／`{ ready: false }`；不输出配置、异常栈或完整插件快照。停止期间新请求返回 503 或连接被拒绝。在途请求完成后才关闭插件；使用 Fastify `forceCloseConnections: 'idle'`，并让关闭期间的响应携带 `Connection: close`，避免在途请求结束后留下新的空闲保活连接。没有强制销毁仍在处理的请求。

## 状态、错误与限制

- `inspect().state`：运行时当前审计通过为 `ready`，失去就绪为 `not-ready`；开始退出后为 `stopping`、`timed-out`、`stopped` 或 `cleanup-failed`。不缓存一份独立插件状态机。
- `stop()` 登记一次有界关闭；重复调用共享 Promise。`completion()` 同样会发起关闭，但等待真正完成，不能用它提前注册“将来退出”的通知。默认预算 5000 毫秒。
- 预检失败抛 `CompositionRejectedError`，插件激活失败沿用 `CompositionStartError`。宿主资源申请失败抛 `HostStartError`，其 `shutdown` 为退出观察结果，`host` 保留实际收尾的检查与 `completion()` 入口；即使已超时也不丢失资源责任。
- 关闭预算覆盖宿主资源和插件退出，不是启动 watchdog。当前可信插件的异步 `setup` 必须自行完成或响应其取消约定；尚无启动期限、启动中外部取消或进程级强杀沙箱。不能据此承诺任意第三方初始化均可有界终止。
- `bindProcessSignals(host, report)` 显式订阅 SIGINT／SIGTERM，首次事件撤销监听并发起停止；返回函数可主动撤销。失败／超时设置 `process.exitCode = 1`，不调用 `process.exit`，不强杀仍未释放的资源。手动管理宿主时，调用方负责同时撤销信号订阅。
- 页面卸载不保证等待异步释放；应用路由或生命周期应显式停止。W2 不提供跨标签共享状态、身份、重试、数据库、WebSocket 或完整任务调度。
- 服务端配置不自动进入浏览器；私密值由 Node 端闭包或显式私密配置持有。测试证明本次产物和健康端点不包含服务端测试密钥，不承诺阻止可信应用主动把秘密写入自己的路由响应或浏览器入口。

## 验证与证据

工具链为 Node 24.14.0／npm 11.9.0、TypeScript 5.9.3、Chrome 155.0.8059.85。命令从本仓根目录运行：

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run test:browser
npm.cmd run test:package
```

- Node 回归 88 项：包含原 W1 75 项和 W2 13 项宿主用例。真实 HTTP 覆盖平台拒绝零激活、两实例隔离、在途请求排空、端口冲突清理、处理器错误、动态就绪、有界关闭、资源回收失败、失败后实际收尾与重入。独立子进程验证信号事件处理后自然退出；Windows 上不把 `child.kill('SIGTERM')` 的强制结束误认为 JS 信号处理成功。
- Chrome 对生产构建执行能力拒绝、Vue 初次挂载失败、部分挂载失败、双实例隔离、三轮重新启停、键盘操作、启动失败超时的后续收尾、Vue 卸载失败与脏容器拒绝复用。1280×800 和 640×480 实际渲染截图已目视检查，无页面错误或横向溢出；不代表所有设备或可访问性合规验收。
- `test:package` 在工程外新目录使用 `--omit=dev --ignore-scripts` 安装 tarball；确认无原始 Cordis／TypeScript／强制 Vue 安装，再从公开入口验证 Node HTTP 与无 Vue 的真实浏览器宿主，并通过严格 NodeNext 类型检查。浏览器构建输入不含 Node 宿主／Fastify／服务端密钥；消费者不读取 FluidBlock 源码。
- 报告为 `output/browser/result.json`、`output/package-check-result.json`，截图在 `output/browser/`；每次测试重新创建临时服务器并自动关闭，报告地址不是常驻预览入口。
- `npm audit --omit=dev` 为 0 条告警。完整开发安装仍有 4 条高危项，来自既有 patch-package → find-yarn-workspace-root → micromatch → braces；npm 给出的修复是降级 patch-package，未自动执行。后续升级补丁工具或替换构建补丁方案时需连同 Cordis 固定补丁守卫验证；当前不对不可信 glob 提供服务，不代表该告警可永久忽略或已完成安全审计。

排空验证先采用 `forceCloseConnections: false`，随后核对官方改为 `idle`；仅改选项仍超时。最小 Fastify 复现确认：关闭期间的在途响应结束后仍存在一个空闲连接，而运行时清理尚未开始。最终采用生命周期钩子在停止接入时拒绝请求，并在关闭期间响应结束保活；原排空用例、超时用例和正常退出均通过。可复用经验：先区分 HTTP 排空和插件释放，不能通过延长关闭预算或强杀所有连接掩盖阶段卡点。

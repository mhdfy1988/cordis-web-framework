# W3 最小全栈闭环

日期：2026-10-22。最小全栈闭环已实现并经真实 HTTP、Chrome 和工程外包消费验证。目标是记录编辑样例，不是后台产品、正式登录或通用数据模型；未提交、发布或部署。

## 职责与流程

框架 `src/contracts/http.ts`、`src/http-json` 管理 JSON 协议、版本、校验、错误和客户端请求；Node 适配负责请求身份标识、日志关联、断开信号、HTTP 映射和静态构建资源。HTTP 与浏览器共用协议，不把 Fastify、数据库或业务记录写入公共契约。

`examples/records` 独立拥有记录模型、权限用例、SQLite 表结构、身份夹具和 Vue 视图。数据库、身份和记录服务分别通过公开 Cordis 服务契约装配；HTTP 插件显式将业务入口桥接为端点，宿主先排空再卸载。浏览器也通过自身插件作用域拥有客户端／编辑会话和呈现，绝不直接调用服务端容器。

流程：本地演示身份 → 从服务端读取列表 → 选择记录 → 编辑独立草稿 → 带修订号提交 → 服务端校验协议／参数、解析凭据并检查资源权限 → SQLite 条件更新 → 返回已提交数据 → 前端接纳当前请求结果。刷新、重启服务和数据库回读必须得到同一结果。

第 1 轮读取修订 1 并编辑；第 2 轮保存成功后是修订 2，旧修订提交返回冲突；第 3 轮取消保存等待时保留草稿、标记结果未确认，用户核对服务器。取消前未提交可停止；提交后的客户端取消不能回滚，重试不会自动发生。

## 选型与不变式

- HTTP 继续复用 Fastify 5.12.7，校验继续复用现有 Zod 适配；前端用原生 Fetch／AbortSignal 和 Vue 3，不增加同义请求库或状态库。
- 持久化使用 Node 24.14.0 自带 `node:sqlite` 的 DatabaseSync，底层 SQLite 3.51.2。本地试验已确认可用，但官方标为 Stability 1.1／实验性，会保留运行警告。代价是同步访问阻塞事件循环、API 升级需回归；仅用于小型单进程验收，若进入正式高并发／多进程存储，再评估异步驱动或工作线程。相比另装原生驱动，当前避免 Windows 编译与额外分发依赖，不把试验性适配宣称为生产数据库标准。
- SQLite 表和修订规则属于样例仓储；框架不内置记录表。使用参数化语句、明确 schema 版本和原子条件更新；未知磁盘版本启动失败，不删库或回退内存。
- 身份为显式启用的回环本地夹具：服务端生成随机不透明凭据并映射测试身份，浏览器仅内存持有。演示入口可选择编辑／只读身份，绝不是正式认证或 OAuth；样例仅绑定 127.0.0.1，不宣称可信客户端登录。服务端不信任 userId／role／requestId 等客户端自报字段。
- 请求标识由服务端生成，响应、请求日志及业务提交日志关联同一标识；不记录凭据、请求体、SQL 或原始异常消息。日志复用 W1 接口，不创建第二套日志器。
- 网络输入和响应均做运行时验证；协议不符、未认证、无权、参数错、冲突、取消与内部故障可区分。请求／响应有限额，不默认重试写入。
- 取消是可观察信号而非强杀。同步提交前检查取消；一旦 SQLite 条件更新完成，该提交不因 HTTP 响应断开撤销。故障和取消门闩只通过测试侧依赖注入，不创建可远程调用的故障接口。

## 来源证据索引

- Node v24.14.0 SQLite：<https://nodejs.org/download/release/v24.14.0/docs/api/sqlite.html>；源码文档 <https://github.com/nodejs/node/blob/v24.14.0/doc/api/sqlite.md>。依据 DatabaseSync、prepare／run、exec／close 与实验性状态；实际版本在本机独立内存数据库验证。
- Fastify Request／Routes：<https://fastify.dev/docs/latest/Reference/Request/>、<https://fastify.dev/docs/latest/Reference/Routes/>。只在适配内部接触请求、响应和生命周期。
- Fastify 断开检测：<https://fastify.dev/docs/latest/Guides/Detecting-When-Clients-Abort/>。请求 raw.aborted 不能误用 destroyed 替代；已收完请求体后的响应断开还需通过响应 close 且未 writableFinished 检测。相关行为须用真实 HTTP 复验。
- Fetch 标准：<https://fetch.spec.whatwg.org/>。客户端用标准取消与流读取，不手写 HTTP 解析／重试协议。

## 验收范围

正常读写及重新打开、非法 JSON／字段／超量／协议版本、伪造身份／请求标识、只读写入拒绝、他人记录权限、并发修订冲突、存储故障无假成功、取消前未提交与取消后已提交、迟到结果不覆盖草稿、日志关联及脱敏、宿主退出清理、隔离包消费与浏览器产物无服务端秘密。生产认证、分布式事务、完整安全审计和公网部署不在 W3 范围。

## 公开通信接口

- `cordis-web-framework/contracts/http`：操作声明、请求上下文、JSON 端点及静态资源契约；不暴露 Fastify／SQLite 类型。
- `cordis-web-framework/http-json`：`defineJsonEndpoint(operation, handler)`、`createJsonClient({ baseUrl, credential?, fetch? })`、`ApiError`、`ApiClientError` 和协议常量。
- Node 宿主新增 `api`、`assets`、`logger`、`maxActiveApiRequests` 选项；原 W2 GET 路由继续支持。JSON 处理器默认最多 64 个在途，可设 1—1024，超量返回 `unavailable`，不无限排队。静态资源只接收显式内容映射，不把请求路径映射到任意磁盘文件。

操作声明包含静态路径、GET／POST／PUT 方法、输入和输出验证器。GET 首版只接收空对象，不支持查询参数；服务端和客户端都明确拒绝非空参数，不静默丢弃。客户端 `baseUrl` 必须是无路径、凭据和查询的 HTTP(S) 源地址；路径由操作声明决定，不接受跨源双斜线路径。后续参数化路由、流式上传等应另定契约，不硬塞进本协议。

请求头 `x-framework-api: 1` 表示协议代际，`Authorization: Bearer ...` 由身份适配解析，不代表客户端自报角色可信。请求标识始终由服务端生成；响应头 `x-request-id` 必须与 JSON 外壳的标识一致。成功为 `{ protocol: '1', requestId, ok: true, data }`；失败为 `{ protocol: '1', requestId, ok: false, error: { code } }`。客户端校验外壳、标识、HTTP 状态及业务输出，不把任意 200 当作成功。

错误映射：参数非法 422、未认证 401、无权 403、不存在 404、修订冲突 409、协议不符 426、超量 413、媒体不符 415、服务暂不可用 503、内部失败 500；取消的服务端诊断使用 499，客户端断开后不保证还能收到该响应。客户端另外区分网络错误与非法响应。错误响应和日志不包含原始异常文本。框架处理的是 JSON 端点错误；原有非 JSON 健康／静态／GET 路由维持各自响应，不应当作统一 JSON 客户端入口。

请求体最多 65,536 字节；服务端成功响应把完整外壳序列化后按 UTF-8 字节计限额，客户端按流读取并累计实际字节。验证器处理的是运行时数据，不仅是 TypeScript 类型。客户端不重试写请求、拒绝重定向、不自动带浏览器 Cookie；生产身份／Cookie／CSRF／跨域策略仍需独立设计。

请求上下文只有服务端请求标识、可选不透明凭据、取消信号与关联日志器，不含当前用户全局变量、数据库或全应用对象。断开后处理器仍可能执行，因此宿主关闭既等待 HTTP 连接，也等待已登记处理器真正收尾，再卸载业务与数据库插件。当前没有业务处理超时／强杀：`requestTimeout` 不是任意异步处理器的执行期限；处理器不收尾时关闭预算会报告超时，而不会提前关闭其依赖。

## 样例结构与状态所有权

| 位置 | 所有职责 |
| --- | --- |
| `examples/records/shared/protocol.ts` | 记录网络输入、输出、修订字段和严格 Zod schema |
| `server/contracts.ts` | 仓储、身份、记录服务的进程内契约及服务键 |
| `server/sqlite-repository.ts` | 数据库连接、schema v1 初始化、事务、条件更新和关闭 |
| `server/fixture-identity.ts` | 随机凭据到测试主体／写权限映射，实例最多 16 个凭据，退出全部失效 |
| `server/record-service.ts` | 资源权限、保存用例与提交日志；测试门闩只在依赖注入处接入 |
| `server/application.ts` | 四个插件的清单、绑定和 HTTP 桥接，不复制业务过程 |
| `browser/editor-session.ts` | 草稿、选择、在途请求序号、取消／核对和关闭；不依赖 Vue／DOM |
| `browser/RecordsPage.ts`、`RecordList.ts`、`RecordEditor.ts` | 页面协调、列表意图、编辑表单；组件不直接请求数据库 |
| `browser/application.ts` | 独立浏览器插件装配，凭据为每个实例闭包；返回可显式停止的宿主句柄 |

浏览器取消或关闭后，以请求序号拒绝迟到结果。保存失败不清空草稿；写入结果可能不确定时锁定再次提交并提供“核对服务器”。核对只更新服务器基线，不覆盖草稿；确认为不同内容后，用户可再次显式保存。切换身份或记录时有草稿则确认放弃；忙碌或结果未确认时不可切换对象。只读身份不能编辑，服务端仍独立校验写权限，界面禁用不是安全边界。

数据库初次初始化在事务中创建 v1 表和演示数据，不因重启覆盖既有记录；读到未知版本或损坏表时失败，不删库。保存只修改所属主体和匹配修订的记录，成功后修订加一。服务器重启后随机演示凭据失效，需要重新选择身份；持久记录仍保留。当前不实现账号管理、凭据刷新、多进程迁移或正式登录。

## 运行与验证

在仓库根目录使用 Node 24.14.0／npm 11.9.0：

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run test:browser
npm.cmd run test:records
npm.cmd run test:package
```

查看样例：`npm.cmd run build:records` 后执行 `npm.cmd run example:records`，从日志读取本次随机回环地址。数据库固定在仓库 `output/records-demo/records.sqlite`，普通重启保留；程序不会自动打开浏览器，需使用 Chrome 访问。Ctrl+C 发起受控退出。演示身份入口只能用于本地，不能直接上线。测试使用 OS 临时目录中的独立数据库、随机回环端口和独立 Chrome 上下文，结束后关闭；不会替换已有主入口或访问 FluidBlock 的数据。

本轮 Node 回归 104 项：W1／W2 88 项及 W3 16 项，覆盖真实协议、UTF-8 包装预算、在途上限、严格输入／输出、身份与资源权限、请求日志关联、保存和数据库直接回读、重启、修订冲突、数据库锁故障、未知版本拒绝、提交前／后取消及编辑会话迟到／关闭行为。

真实 Chrome 155.0.8059.85 验收生产构建：正常保存和数据库回读、刷新、协议版本不兼容、并发修订冲突、故障保留草稿与恢复、提交前／后取消和核对、只读模式、键盘操作、浏览器实例显式停止与表单标识隔离。1280×850 桌面、640×720 窄屏以及错误状态截图已目视检查；无横向溢出或未处理页面异常。窄屏允许纵向滚动，不声称所有操作均在首屏。

`test:package` 在工程外目录安装 tarball（`--omit=dev --ignore-scripts`），先验证非 Vue 消费者不被强制安装 Vue，再为样例显式安装 Vue。拷贝的是样例应用而非框架源码；样例通过包公开导出启动服务端、保存、重启回读，并用真实 Chrome 保存到隔离数据库。严格 NodeNext 的正／负类型检查同时覆盖通信入口。浏览器构建输入不含 Node 宿主、Fastify、SQLite、样例服务端或服务端秘密来源。

证据：`output/records-check/result.json` 与同目录截图、`output/package-check-result.json` 及其中 `fullstack` 结果、`output/records-web/meta.json`。这些报告的地址是已经关闭的验收入口，不是常驻预览服务。源码／构建／隔离消费已验证，不表示正式发布、正式安装、生产认证或完整安全审计完成。

最终干净安装使用 `npm.cmd ci --no-audit --no-fund`，随后上述四项功能／产物门禁全部通过。普通 `npm ci` 的在线审计阶段等待外部接口过久，已核对并仅停止本次进程；限时独立执行 `npm audit --omit=dev --json --fetch-timeout=10000 --fetch-retries=0` 仍返回 registry 审计端点超时。W3 无依赖新增，W2 的 0 条生产告警和 4 条开发依赖告警只保留为历史结果，本轮在线安全审计未成功刷新；它不构成功能失败，也不能写成安全审计通过。

## 本轮沉淀

断开连接与处理器结束是两件事：取消请求时若只等待 Fastify 监听关闭，仍在执行的业务可能读到已关闭数据库。本轮对处理器另行登记有界数量并在宿主退出时排空，真实提交前／后取消用例验证最终数据库状态。后续不得用“浏览器已取消”代替服务端提交或清理结论。

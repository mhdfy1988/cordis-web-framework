# W1：无界面公共核心与包交付

日期：2026-10-22。本文记录 W1 公开契约、装配、基础配置／日志和受控关闭的实现与当时验收。后续宿主实现和真实 Chrome／HTTP 验证见 [W2 记录](w2-hosts.md)，不将下文 W1 时点的 VM 结果追认为浏览器验收。本项目未初始化 Git、提交、发布或部署。

## 1. 使用与验证

在项目根目录，使用 Node 24.14.0、npm 11.9.0：

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run test:package
npm.cmd run example:core
```

- `test`：先应用依赖补丁并构建，再类型检查、上游试验与项目契约／边界回归。公开契约测试从包导出加载 dist，不直接使用来源项目源码。
- `test:package`：重新构建并打本地 tar 包，在工程外系统临时目录安装，使用 `--omit=dev --ignore-scripts`；运行真实 Node 消费、严格 NodeNext 类型检查、浏览器目标构建及无 Node 全局的 VM 执行。结果记录在 `output/package-check-result.json`。
- `example:core`：通过公开入口连接配置、插件装配、日志、就绪审计和关闭。需要先构建，不是产品服务器。
- `build`：生成 ESM 与类型声明；不启动服务。`prepack` 会构建；`test:package` 显式构建后以忽略脚本方式打包，避免重复打包钩子。

当前产物为 `output/cordis-web-framework-0.0.0.tgz`，可本地验证，不是公开发行版。框架包保持 `private: true`／`UNLICENSED`，正式品牌与自有代码许可证待决定；第三方许可另见根目录 THIRD_PARTY_NOTICES.md。

## 2. 公开入口和依赖

| 导入入口 | 内容 |
| --- | --- |
| `cordis-web-framework` | 运行契约、服务标识工厂及插件 API 常量；不自动导入实现 |
| `cordis-web-framework/runtime` | 运行句柄、作用域、快照等契约 |
| `cordis-web-framework/contracts/composition` | 模块清单、装配文档、校验结果与问题项 |
| `cordis-web-framework/runtime-cordis` | 已修复、内置 Cordis 的运行时适配 |
| `cordis-web-framework/composition` | `definePlugin`、预检与装配、拒绝／激活异常 |
| `cordis-web-framework/validation-zod` | Zod 到项目校验接口的适配 |
| `cordis-web-framework/version-semver` | 精确版本、范围与满足关系适配 |
| `cordis-web-framework/config` | 来源明确的配置解析与只读快照 |
| `cordis-web-framework/logging` | 日志契约与 Consola 适配工厂 |
| `cordis-web-framework/shutdown` | 有界关闭观察与真实完成等待 |

单包多入口用于当前独立消费验证，不意味着每个模块都要拆成工作区包。运行依赖为 zod 4.6.7（MIT）、semver 7.8.5（ISC）、consola 3.4.2（MIT）；宿主可只导入需要的入口，不强制实例化所有能力。写 Zod schema 的消费插件应显式声明自己的 Zod 依赖，不依赖偶然的提升布局。

构建／测试依赖精确锁定 TypeScript 5.9.3、esbuild 0.28.2、patch-package 8.0.1、Cordis 4.0.0-rc.11、@types/node 24.10.1、@types/semver 7.8.0；以 package-lock.json 为实际依赖依据。消费包不需要这些开发工具。

## 3. Cordis 修复如何交付

来源是 FluidBlock 已核对的 Cordis rc.11 和上游 PR #133 补丁；迁入的源代码在新项目独立维护，旧项目未改动。装配、服务桥接、状态与资源语义保留，额外补上了关闭重入回归。

构建流程：精确版本守卫 → patch-package 应用补丁 → 核对补丁实际存在 → TypeScript 输出 → esbuild 内置 Cordis／cosmokit → 检查运行适配产物没有外部运行时导入。

消费方直接使用已构建产物，不安装 Cordis，不执行 postinstall，也不修改其他包的 node_modules。独立消费测试实际验证等待插件 stop 后终态为 stopped，不能只用字符串存在证明修复有效。升级时重新评审版本／补丁，重建并重跑契约与消费验证。

取舍：普通外部依赖加消费方安装补丁会依赖提升布局与安装脚本，禁止脚本时失效；内置修复产物避免该要求，但增加框架更新与第三方许可维护责任。不宣称直接兼容 Cordis 可选加载器或所有生态插件。

## 4. 配置语义

`resolveConfiguration(sources, validator)` 输入 unknown 来源数据与项目 `ConfigValidator<T>`，返回项目统一校验结果，不在核心读磁盘、环境变量或偷偷转换字符串。

来源结构为 `{ id, kind, values }`：

- 固定优先级：`defaults < file < environment < override`，不依赖传入数组把低优先级排在最后。
- 同 kind 保持输入顺序，后者覆盖；来源 id 必须唯一，最多 64 层。
- 仅顶层字段整体替换，不隐式深合并数组／嵌套对象。环境来源必须由宿主先解析成所需数据类型。
- 来源与解析结果是 JSON 对象；特殊原型字段拒绝，模块 schema 决定业务字段与默认值。
- 成功结果包含 `value`、顶层字段来源 `origins`、有序来源元数据 `sources`，递归冻结，不暴露可写共享数据。
- schema 新增默认字段标记为 `schema-default`；来源元数据不复制原始值，错误路径区分 `sources` 与 `config`。

此处手写的是框架的来源优先级／覆盖政策，结构与 JSON 校验继续使用 Zod；没有手写文件解析器、环境加载器或重新实现校验库。完整配置文件、密钥与运行环境适配属于宿主阶段。

## 5. 日志语义

`createLogger({ level?, context?, write?, onOutputError?, maxPendingWrites? })` 返回项目 `Logger`，只有 `log(level, message, fields?)` 与 `child(context)`；不向插件暴露第三方可写对象。

- 支持 debug／info／warn／error，工厂支持 silent；Consola core 负责级别分发，关闭其隐式重复合并，不接管全局 console。
- 事件含 ISO 时间、级别、消息和结构化字段；默认输出一行 JSON 到对应 console 方法。Node 下由标准控制台输出到进程流，不直接管理文件轮转。
- 应用显式绑定实例，插件通过子日志器绑定身份。父上下文不可被子上下文或单条字段覆盖；请求上下文的自动注入留给后续宿主，不以手写字符串冒充自动追踪。
- 对含 password／passwd／token／authorization／cookie／secret／api-key 等名称的结构化字段脱敏；循环、错误、不可读字段可安全表达。自由文本和 Error.message 不保证自动识别秘密，禁止写入令牌、原始请求体或素材内容。
- 消息最多 1024 字符；字段每对象／数组最多 32 项、字符串最多 512 字符、深度与全局遍历预算受限。这是事件容量限制，不是任意恶意对象的安全沙箱。
- 异步输出默认最多 32 项在途，可配置 1—1024；饱和丢弃超量事件并显式通知一次，恢复后允许再次报告拥塞，不无限排队。
- 同步输出异常、异步拒绝通过 onOutputError 通知；未指定时只输出固定最小错误，不重放敏感事件。错误观察器抛错不破坏业务。

Consola 遇到带 message／args 的对象会将其解释为自身日志结构，因此适配使用官方 `.raw()` 保留完整项目事件。该行为已有回归。文件输出、远端上报、审计存储、异步输出器的持久化／排空由后续宿主或自定义 write 的所有者负责；W1 不承诺日志持久化或可靠送达。

## 6. 受控关闭语义

`createShutdownController(runtime, { timeoutMs? })` 的预算默认 5000ms，必须为 1—2147483647 的整数。

- `inspect()`：只读当前关闭状态及实际运行时快照。
- `stop()`：发起一次关闭，重复调用共享同一 Promise；实际收尾则返回 stopped／cleanup-failed，观察预算到期返回 timed-out。
- `completion()`：发起或显式等待真正的关闭收尾，可能无限等待；不会强杀代码、恢复运行时或解除资源责任。

第 1 轮调用 stop 立即通过 runtime.close 禁止新装配。第 2 轮预算到期，仍挂起的清理保持 stopping，报告 timed-out，不假装资源已释放。第 3 轮真实清理完成，inspect／completion 更新到实际终态；早先超时快照保持原样，旧运行时仍关闭，不重用脏实例。若清理永不完成，状态持续超时隔离，需要宿主明确处置。

原始 RuntimeSnapshot.closed 表示不再接收新装配，不表示所有资源已经释放。销毁真正完成必须等待 completion 或原 runtime.close；失败诊断不能用 Promise 正常结束掩盖。进程强杀、HTTP 停止接单、任务排空、信号处理、激活超时属于后续宿主／任务接入，不在 W1 伪装成已经实现。

幂等 Promise 在发送取消信号之前登记，因为用户 abort 监听器可同步重入。运行时 close、插件 stop 与关闭控制器均有该回归，且不改变 Cordis 的清理调度职责。

## 7. 验证与边界

本项目的 npm test 包含上游 16 项、公开运行时 20 项、装配 21 项、配置 4 项、日志 6 项、关闭 6 项、边界 2 项。总数以实际命令输出为准，不挪用来源浏览器数量。

本轮实际结果：干净 `npm.cmd ci --no-audit --no-fund` 后，`npm.cmd test` 75 项全部通过，0 失败／跳过／TODO；`npm.cmd run test:package` 与 `npm.cmd run example:core` 均通过。运行适配 JS 约 67.6 kB（未压缩，不含 source map），构建元数据确认内置第三方运行代码只有 Cordis 与 cosmokit；该数字不是整个应用体积或性能承诺。

包消费位于工程外临时目录，避免 Node 向上解析到本仓开发依赖。实际验证：仅生产依赖、禁用脚本、没有消费方 Cordis／TypeScript 安装，仍能完成合法／非法装配、真实服务读取、配置、日志脱敏、清理与 PR #133 终态；再用开发侧 tsc 对消费方做 skipLibCheck=false 的严格 NodeNext 检查。

消费包随后用 esbuild platform=browser 打包，检查无外部运行导入，并在不提供 process／require／Buffer 的 VM 上下文执行相同闭环。它证明构建和可移植运行边界，不代表真实 Chrome、Vue、HTTP 或全栈应用已验收。W2 必须重新建立真实宿主与浏览器验收。

边界检查使用 TypeScript 语法树，覆盖非法类型导入、转导出和动态导入；允许 Node 宿主的合法例，拒绝核心 Node／Vue 泄漏。仅规则覆盖的导入可由自动检查证明，不能代替职责审查。未做长期压力、完整安全审计、正式发布或生产部署。

## 8. 官方依据、源码落点和取舍

- [TypeScript 扩展名重写](https://www.typescriptlang.org/tsconfig/rewriteRelativeImportExtensions.html)：源码采用 .ts 相对导入，构建 JS 重写 .js；声明保留类型解析引用，通过真实消费方类型检查验证。
- [TypeScript 模块解析](https://www.typescriptlang.org/tsconfig/moduleResolution.html)：固定 Cordis 声明的无扩展名导出无法按 NodeNext 解析，本仓使用 Bundler 构建模式，消费方仍通过严格 NodeNext；没有改上游声明或放宽消费方检查。
- [esbuild 打包 API](https://esbuild.github.io/api/#bundle)：只将运行适配与其固定依赖内置，替代消费方补丁钩子；成本是新增构建工具与内置代码维护，落点 scripts/build.mjs。
- [npm files／exports](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)：显式列出公开入口与打包文件，不要求使用者相对导入 src。
- [Consola core、reporter 与 raw](https://github.com/unjs/consola)：选择精简跨环境构建及自定义输出器，不引入服务端专属格式器；成本是日志依赖、包体与适配回归，落点 src/logging-consola。
- [Consola 3.4.2 源码](https://github.com/unjs/consola/blob/v3.4.2/src/consola.ts)：日志对象解释和全局暂停队列语义；框架不暴露全局 pause／wrap 接口，保留实例输出边界。
- [Zod](https://zod.dev/api)、[node-semver](https://github.com/npm/node-semver)：沿用成熟结构与版本解析，落点 src/validation-zod／src/version-semver，不再维护另一套解析规则。

尝试路径总结：NodeNext 本仓构建被固定库声明阻断，改为匹配真实打包流程的 Bundler，另验消费方 NodeNext；直接将事件传给 Consola 导致 message 被展开，按官方 raw 语义修正；仅在工程内消费可能被父目录依赖兜底，改到工程外并处理 Windows 跨盘符路径。三项均用实际消费／回归验证，不降低断言或添加旧实现回退。

长期约束：先登记关闭幂等句柄再发送取消信号；产物消费必须位于源码工程外；第三方日志对象结构不能假定与项目事件同形。后续新增宿主优先复用这些契约与回归，不重新手写核心。

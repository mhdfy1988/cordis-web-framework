# 独立插件包与管理契约

P1 决策日期：2026-10-22。本文为首版格式规范，当前用法见[管理教程](guide/plugin-management.md)，实施与交付状态只看 implementation-plan.md，不由规范存在推断整体验收完成。

## 格式与信任

首版使用有大小预算的 JSON 包：formatVersion 为 1，manifest 复用现有插件清单，entries 含 browser／node 至少一个自包含 ESM 字符串，assets 是文本资源数组，integrity 是对其余字段规范化 JSON 的 SHA-256。完整性只检查内容一致，不能证明作者可信。安装接口要求调用者明确接受该精确摘要；安装和恢复都校验内容，启用才执行代码。拒绝不兼容版本、无当前平台入口、重复安装身份及资源非法路径；不自动升级。

JSON 预算为单包 4 MiB、总记录 32 MiB、128 个安装项；超预算快速拒绝。没有远程 npm 安装或安装脚本执行，不解释清单字段为任意本地路径。代码和资源作为包数据保存，不解压到用户指定路径。

ESM 默认导出工厂 `(manifest, assets) => RegisteredPlugin`。框架传入经校验冻结的清单；工厂每次返回新的定义，setup 才申请资源，prepare 仍需纯净验证 JSON 配置。工厂不能改变包清单身份。普通依赖由 esbuild 随插件独立构建；未解析外部导入由构建门禁拒绝。插件通过声明服务消费宿主能力，不自行捆绑第二套 Cordis／Vue；Vue 插件的呈现服务由宿主适配提供。首版不做任意 import map 或跨包相对模块解析；需要多块分包或原生模块时另定格式版本，不静默退回宿主打包目录。

合法入口示意：

```js
export default manifest => ({ manifest, prepare(config) {
  if (config !== undefined && typeof config !== 'object') return { ok: false, issues: [{ path: [], message: '配置须为对象' }] };
  return { ok: true, value(scope) {
    scope.provide({ id: 'example.greeting' }, { text: '你好' });
    scope.onDispose(() => { /* 释放该实例申请的资源 */ });
  } };
} });
```

非法例：formatVersion 为 2；entries 为空；资源名为 ../secret；integrity 与内容不符；宿主 node 却只给 browser；插件自行导入未随包交付的 ./part.js。静态检查和真实导入应分别覆盖这些边界，不以哈希正确代替兼容验证。

## 运行与持久化

### N1：npm 格式支持决策（2026-10-23）

标准包保留原有 package.json，新增 `cordisWeb` 对象：`formatVersion: 1`、`manifest`（现有插件清单）、`entries`（node／browser 包内入口）、`assets`（资源标识到包内路径）、`shared`（需要宿主提供的共享模块名数组）。包名／版本与插件 manifest.version 必须一致；插件 ID 仍独立于 npm 的作用域包名。入口必须 ESM，默认导出 `(manifest, { assets, shared }) => RegisteredPlugin`；工厂每次产生新定义，实例资源只在 setup 申请。

复用本机 npm CLI 11（本机 11.9.0）处理本地目录、.tgz 及精确版本 registry 包的依赖，使用独立受管目录，不操作主应用 node_modules。默认 `--ignore-scripts`，没有脚本批准入口；需要原生构建脚本的包明确不支持。依赖下载不等于执行插件，启用后才导入入口。普通依赖保留 Node 模块解析，共享运行时经工厂参数提供；禁止安装树携带第二份 Cordis／Vue／本框架，不自动升级 peer。框架只校验自身 API 及已声明共享能力；其他 peer 未满足时显式拒绝。

Node 安装目录采用随机键、包管理器锁文件及全树内容摘要，包来源和实际版本持久保存；公共管理器仅保存平台无关引用，平台仓库负责暂存、校验、加载、清理和孤立目录恢复。包操作进入现有串行队列；安装前暂存且不执行代码，提交安装记录才算安装成功；中断未提交目录在下次持锁恢复时清理。卸载先干净停用并提交记录移除，再清理物理文件；清理失败报告孤立目录，不伪造事务回滚。包库与配置库分别独占，关闭后才能交给另一实例。

浏览器首版要求声明入口是独立构建的自包含浏览器 ESM（Node 入口仍允许多文件及 npm 依赖），资源随浏览器交付数据携带，以受管对象 URL 提供。Node 适配可导出该浏览器数据供全栈客户端下载，纯静态应用也能导入相同数据并本地持久化；不承诺直接在页面安装 .tgz、多文件任意网络 import 或执行 Node 代码。发布模板须以构建门禁验证浏览器入口没有外部导入；这不是整个 npm 包必须合并为一段代码。安装状态与服务端／浏览器各自激活结果分开，不新增跨标签同步。

兼容采用可选的标准包记录，不改变现有 JSON artifact；新适配缺失时明确拒绝标准包，不退回旧加载器。旧记录保持格式版本 1 的既有字段，新增字段由严格校验认可；旧框架不能读取含新字段的新记录，迁移前须留备份，不能声称可无损降级。运行缓存不保证物理卸载，不提供热升级。

选择 npm 是复用本机现成工具且不新增安装运行库；使用参数数组调用 npm 的 JavaScript CLI，避免 Windows shell 拼接。暂不选直接引入 Harness 的 pnpm 安装器，因为其 profile／配置补丁与本框架持久模型不同，也不引入第二套 Cordis。安装／压缩包解析交 npm，框架不手写解压器。工具依赖、磁盘空间、网络及锁均成为显式失败面。

依据：[npm install](https://docs.npmjs.com/cli/v11/commands/npm-install/)、[package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)、[Node ESM](https://nodejs.org/docs/latest-v24.x/api/esm.html)。Harness 的 runProfilePnpm／bundle／独立浏览器入口证据见唯一计划的来源索引；借鉴分层而不复制其实现。当前实现与验证状态分别看管理教程和唯一实施计划，决策文本本身不构成验收证据。

公开契约位于 `src/contracts/management.ts`，严格校验位于 `src/validation-zod/management.ts`，管理协调位于 `src/plugin-management`；当前接口还包括只读 configuration、drain，以及 configure(restart=true) 的明确配置重启。图变更采用同一管理实例的全局串行队列，不只是逐插件锁。

| 操作 | 意愿／安装记录变化 | 执行与失败规则 |
| --- | --- | --- |
| install | 写入已校验包，enabled 为 false | 不导入、不 setup；摘要未明确接受则拒绝 |
| enable | 先提交 enabled=true 与 pending 操作 | 执行后记录实际结果；缺依赖保持等待，激活失败不伪造已停用 |
| disable | 先提交 enabled=false 与 pending 操作 | 等待清理；消费者保留自己的启用意愿，运行状态可以等待 |
| configure | 默认只允许干净停止项；restart=true 先保存新配置及启用意愿，再停止重建 | 必需项不可运行中重启；不是无损热升级，失败和中断须核对实际状态 |
| uninstall | 先检查安装依赖；干净停用后移除记录 | 清理失败、必需项或内置项拒绝；保留应用用户数据 |
| close | 不改变已保存意愿 | 拒绝新操作、等待队列、关闭运行时，再释放库独占权；脏运行时不可提前放锁 |

管理操作先提交的意愿与实际结果并非跨引擎事务。保存失败须抛出明确错误并保留可观察状态；已运行资源不会因存储写失败自动回滚。恢复发现 pending 时报告中断记录，再按持久意愿重建运行，不沿用上次的实例对象或 ready。

框架拥有统一管理规则。内置插件也经该管理子系统启停，但代码由宿主静态提供，不能冒充独立安装包；必需／恢复插件禁止停用和卸载。完整动态安装闭环必须在无页面场景先完成。

同一个安装库只允许一个存活管理写入者：Node 使用独占锁文件与临时文件原子重命名，异常退出遗留锁须人工确认原进程退出后恢复，不能按时间自动抢占；浏览器使用 Web Locks 和 IndexedDB 事务。每个管理实例将图变更串行化，安装记录以修订号比较交换写入，先保存意愿与 pending 操作，再执行，再保存结果；写失败报告明确错误，不谎称运行已回滚。重启对 pending 操作做显式恢复诊断并按已提交意愿重新协调，不复制旧运行状态。

P3 已分别通过 Node 实际 JSON 文件回读／独占／CAS 和 Chrome IndexedDB／Web Locks／刷新／Blob 导入检查。消费应用旧设置迁移采用一次性初始化：仅在安装库从未初始化时导入已严格校验的旧设置，成功提交后由新库成为唯一真值；已有新库不再读取旧设置，失败不得标记迁移完成。P6 已实现文档应用映射，旧设置成功迁移后不再参与后续启停管理。

停止提供者前停用已加载消费者（不改变消费者启用意愿），恢复时按图重新协调；缺失服务允许表达等待，但不隐式选择提供者。卸载依赖仍被安装项绑定的包默认拒绝，要求先处理消费者。用户数据不在包记录中，卸载默认不删除应用数据。

## 复用决策与源码依据

- 复用当前 Cordis 4.0.0-rc.11＋PR133 的依赖调度、清理和诊断，不安装第二套加载引擎。
- [上游加载器固定包清单](https://github.com/cordiverse/cordis/blob/01b396240ce47cf2779c40af9bc445bb748fe112/packages/loader/package.json)声明 peer cordis ^4.0.0-rc.12；不直接加入本基线，避免未经验证升级。其入口／模块解析分层可借鉴，但不复制整套公开 Cordis 上下文给业务。
- Zod 负责运行时包及持久记录校验，semver 复用既有适配；esbuild 是已有构建依赖，用于独立单入口打包与外部依赖门禁。没有新增生产第三方依赖。
- [Node ESM](https://nodejs.org/api/esm.html#data-imports)的 data 模块不能解析相对模块；Node 用编码后的自包含 ESM，浏览器用 Blob 模块。实际 Node 24／Chrome 验收必须独立证明，不能用当前官网版本替代本地运行。
- [IndexedDB 事务](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction)负责浏览器写入完成；配合实例存活期间的独占锁，不把 set 请求成功误作事务完成。

接受的代价：首版包自包含、同库单写、可信代码同进程；无法强杀恶意插件，也不保证引擎卸载模块缓存。内存 namespace 缓存必须有限制、模块顶层无实例资源；需要强隔离／无限版本热替换时重评 Worker／子进程方案。持久化是平台适配，不污染核心契约。

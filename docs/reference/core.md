# 运行与插件装配

## 标识和类型

`service<T>(id)` 接收非空字符串，返回冻结的 `ServiceKey<T>`，空白 id 抛 TypeError；`T` 是服务静态契约，不实例化服务、不验证外部输入。相同语义服务应共享同一标识及版本，避免应用自行拼多种名字。

`PluginDefinition` 是底层运行定义（服务键数组、setup），`RegisteredPlugin` 是带清单和纯配置验证的装配模块，两者不能混用。正常应用优先 `definePlugin`＋装配文档，不自行重复实现兼容校验。

`PluginManifest` 中 id、精确 version、apiVersion、requires、provides 必填；host 可选。requires 使用服务 id/range，provides 使用 id/version；host 明确 platforms 和 capabilities。`PluginCatalog` 为 entry 到 RegisteredPlugin 的只读 Map；`CompositionDocument` 格式 1，plugins 的 config 可省，bindings 显式指定实现。结构和 JSON 输入受运行时验证，不把 TS 类型当作可信边界。

## definePlugin

输入 `{ manifest, config: ConfigValidator<T>, setup(scope, config) }`，返回 RegisteredPlugin。定义时不执行 setup；prepare 用 validator 解析并冻结配置，成功后生成运行定义。校验器应纯净，无文件、网络或资源申请。Zod schema 默认值可以显式提供，不靠异常时回退旧配置。

`scope.get(key)` 只取已声明依赖；`provide(key, value)` 只发布已声明能力；`onDispose(cleanup)` 登记退出资源；`signal` 提供生命周期取消。停止后不能继续读服务或登记资源；错误见运行快照诊断。不得把作用域保存为全局当前用户上下文。

## validateComposition

参数为 document、catalog、可选 apiVersion（默认插件 API `1.0.0`）、可选 environment。document 可为 JSON 数据或 JSON 字符串，预检完整结构、身份、版本、配置、绑定、循环和平台要求。返回 `{ ok: true, plan }` 或 `{ ok: false, issues }`，不创建运行时、不申请业务资源。`ValidationIssue.path` 为字段路径，CompositionIssue 额外含 code、可选 pluginId/serviceId。

plan 是只读预检结果，不是可绕过下一次验证的授权令牌。含平台声明时，裸装配须提供相符 environment；宿主会提供自己的实际环境。

## assembleComposition

参数 document、catalog、`{ createRuntime, apiVersion?, environment? }`。成功返回独立 Runtime，失败预检抛 `CompositionRejectedError`（issues），激活未就绪／异常则先关闭本次运行时再抛 `CompositionStartError`（snapshot）。不存在“部分成功继续跑另一套旧插件”的行为。

成功条件是插件真就绪，而不是只等待 settle。createRuntime 必须返回新实例，不能混入以前未审计的插件。异步 setup 不合作或清理永不完成时，本函数不承诺启动看门狗或硬中断。

## createCordisRuntime 与运行句柄

`createCordisRuntime()` 无参数，返回 Runtime；修复后的 Cordis 已内置，消费方不直接接触 Cordis 对象。运行时对象只能用于所属实例。

| 方法／类型 | 输入输出与时序 | 失败／责任 |
| --- | --- | --- |
| `Runtime.load(definition)` | 返回 PluginHandle，可进入 waiting／starting | 重复身份、关闭后装载或定义错误不可假成功；运行激活错误留诊断 |
| `PluginHandle.inspect()` | 当前 PluginSnapshot | 快照不是可写控制入口 |
| `PluginHandle.settle()` | 等待当前变动结束 | waiting 也可能返回，不保证 ready |
| `PluginHandle.stop()` | 等真实清理，返回终态快照 | 检查 stopped／cleanup-failed；重复调用共享清理 |
| `Runtime.inspect()` | RuntimeSnapshot | closed 仅表示禁止新装载，不等于已释放 |
| `Runtime.settle()` | 等当前运行变动，返回快照 | 之后仍须 audit |
| `Runtime.audit(ids?)` | 默认检查全部已装载插件，返回 ready/issues | 显式名单可能报告 not-loaded；不隐藏其他诊断 |
| `Runtime.subscribe(listener)` | 返回撤销函数 | 所有者退出时撤销；观察故障保留诊断，不破坏核心流程 |
| `Runtime.close()` | 禁止新装载，按依赖等待清理，返回最终快照 | 不强杀悬挂任务；幂等，不重开已关实例 |

## 状态与诊断

`PluginState`：waiting（依赖未齐）、starting（激活中）、ready、failed、stopping、stopped、cleanup-failed。等待中的插件收到 stop 后不会因服务后来出现而复活。干净停止后如需重新装配，使用新的定义实例／运行身份，不能复用旧 scope。

PluginSnapshot 的 id／instanceId／generation 区分逻辑插件和本次运行，waitingFor 指明缺失服务；diagnostics 含 code、phase 和可选插件／运行标识。RuntimeSnapshot 聚合状态。`Readiness.issues` 指出未就绪插件及其状态，属于只读观察，不是第二个调度器。

所有精确字段与导出类型（包括 Cleanup、ServiceKey、ValidationResult、CompositionPlan／Result 等）见[生成签名](signatures.md)。完整调用见[插件示例](../examples/plugins.mjs)。

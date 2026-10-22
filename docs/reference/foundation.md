# 配置、校验、日志、版本与关闭

## resolveConfiguration

接收 unknown 来源数组与 ConfigValidator，返回 `ValidationResult<ConfigurationSnapshot<T>>`。每个来源 `{ id, kind, values }`；固定优先级 `defaults < file < environment < override`，同级后者覆盖。最多 64 层，id 唯一，values 必须 JSON 对象，禁止特殊原型字段；结构／验证器异常转为 issues，不用异常兜底旧配置。

只顶层整体替换，不隐式深合并。快照的 value／origins／sources 递归冻结，origins 为顶层字段最终来源，schema 默认值标记 schema-default。函数不读磁盘／环境变量、不解析 .env、不转换字符串；宿主先读取并显式转换，再传入 typed JSON。

## zodConfig 与导出验证器

`zodConfig(schema)` 返回 `ConfigValidator<T>`，`validate(unknown)` 返回 ok/value 或 issues；schema 解析结果还需是 JSON，Date／Blob／函数等不会因类型正确就被放行。issues 只含路径和信息；消费者不要原样回显带秘密的 schema 错误文本。

| 验证器 | 对象与边界 |
| --- | --- |
| jsonObjectValidator | JSON 对象，不承诺业务 schema |
| manifestValidator | 插件清单；依赖／提供最多各 256，环境能力最多 64；语义兼容仍由装配预检 |
| documentValidator | formatVersion=1，最多 1000 插件、显式绑定；不装载代码 |
| hostEnvironmentValidator | browser／node 与能力数组 |
| hostReadinessValidator | 不重复的必需插件 id 数组，最多 1000 |
| nodeListenerValidator | 默认 hostname=127.0.0.1、port=0；整数端口 0—65535 |
| configurationSourcesValidator | 来源层／JSON 字段／64 层限制 |
| apiEnvelopeValidator | 严格协议 1、UUID、ok/data 或安全 error.code |
| uiPositionValidator | name/kind/scope/version；实际拥有关系由注册表检查 |
| uiContributionValidator | JSON 贡献元数据，children 最多 64；不接 select 函数，动态注册另行处理它 |
| uiRouteValidator | 字面量静态 path，最多 256 字符 |
| uiNavigationValidator | id/label/routeId，可选整数 order |
| uiThemeValidator | id 和 `--cw-*` 受限 CSS token 值，不接受任意脚本／CSS |

标识一般为去掉首尾空白后仍相同的 1—200 字符文本；priority/order 在 −10000—10000。完整约束由当前签名及运行时校验返回共同表达，不把仅验证结构的函数当成权限检查器。

## 版本适配

`isVersion(text)` 仅精确规范版本为 true，不 loose/coerce；`isRange(text)` 拒绝空范围；`matchesVersion(version, range)` 复用 semver 默认预发布语义。三者返回 boolean，不发起更新、安装或联网查询。想接纳预发布版需明确范围；不会因版本比较通过就保证行为兼容。

## createLogger

参数 LoggerOptions 均可选：level 默认 info，可 debug/info/warn/error/silent；context 默认空；write 默认向对应 console 输出一行结构化 JSON；maxPendingWrites 默认 32、范围 1—1024；onOutputError 用于输出失败通知。返回 Logger 的 `log(level,message,fields?)` 和 `child(context)`，二者不提供可靠存储确认。

LogEvent 包含 ISO time、level、message、结构化 fields；父上下文不被子字段覆写。常见敏感字段名脱敏、消息最多 1024 字符、字符串字段最多 512、对象／数组最多 32 项，并限制深度和总预算。自由文本不保证自动识别秘密，不记录凭据、原始请求体或用户素材。

write 可异步但在途有上限，超量丢弃并通知，不无限缓存；write 或观察器异常不应破坏业务。调用方若要排空／持久化／轮转，应拥有输出器并显式管理，Logger 本身无 flush/close 承诺。类型 LogValue／LogEvent／Logger／LoggerOptions 见签名。

## createShutdownController

参数 Runtime 和可选 `{ timeoutMs }`，默认 5000，整数 1—2147483647；无效预算抛 TypeError。返回 ShutdownController：

- inspect：当前 ShutdownSnapshot，初始 running。
- stop：发起一次关闭，重复共享 Promise；预算内返回 stopped 或 cleanup-failed，到期为 timed-out。
- completion：同样会发起关闭，等待真实收尾，可能无限等待；不能提前调用它来订阅将来退出。

ShutdownSnapshot 保留 RuntimeSnapshot 与可选 error；状态 running→stopping→stopped/cleanup-failed，或先返回 timed-out 后真实收尾再更新 inspect。旧超时快照保持不变。控制器不强杀任务、不解除未释放资源责任，也不重开实例。示例见[插件教程](../guide/plugins.md)。

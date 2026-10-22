# 配置、校验、日志、版本与关闭

本页按“读取配置 → 校验数据 → 记录日志 → 判断版本 → 关闭资源”查阅。输入来源和输出器由应用拥有，框架不暗中读环境或写数据库。

## resolveConfiguration

合并显式来源并校验，返回 `ValidationResult<ConfigurationSnapshot<T>>`。只替换顶层字段，不隐式深合并。

### 来源与优先级

| 来源 `kind` | 优先级 | 用途 |
| --- | --- | --- |
| `defaults` | 最低 | 应用默认值 |
| `file` | 高于默认值 | 应用读出的文件数据 |
| `environment` | 高于文件 | 已显式转换为 JSON 类型的环境值 |
| `override` | 最高 | 本次操作的明确覆盖 |

同级后者覆盖前者。每层为 `{ id, kind, values }`，最多 64 层，ID 唯一，`values` 必须是 JSON 对象，特殊原型字段拒绝。

### 最小示例

```ts
import { z } from 'zod';
import { resolveConfiguration } from 'cordis-web-framework/config';
import { zodConfig } from 'cordis-web-framework/validation-zod';

export function runConfigurationExample() {
  const result = resolveConfiguration([
    { id: 'defaults', kind: 'defaults', values: { port: 3000 } },
    { id: 'environment', kind: 'environment', values: { port: 4000 } },
    { id: 'command', kind: 'override', values: { port: 5000 } },
  ], zodConfig(z.strictObject({ port: z.number().int().min(0).max(65535) })));
  if (!result.ok) throw new Error('配置无效');
  return result.value.value;
}
```

预期返回 `{ port: 5000 }`。如果环境值仍是字符串 `"4000"`，当前数字 schema 会拒绝，框架不会偷偷转换。

### 返回与错误

快照的 `value`、`origins`、`sources` 递归冻结。`origins` 说明顶层字段的最终来源；schema 提供的默认值标记为 `schema-default`。

函数不读磁盘、环境变量或 `.env`。宿主先读取并转换，再传入 JSON 数据。结构和验证器异常转为 `issues`，不兜底旧配置。

## zodConfig 与导出验证器

`zodConfig(schema)` 返回 `ConfigValidator<T>`；`validate(unknown)` 返回成功值或问题列表。

```ts
import { z } from 'zod';
import { zodConfig } from 'cordis-web-framework/validation-zod';

const config = zodConfig(z.strictObject({ name: z.string().min(1) }));
const accepted = config.validate({ name: '文档应用' });
const rejected = config.validate({ name: 123 });
// accepted.ok 为 true，rejected.ok 为 false。
```

即使 schema 解析成功，结果也必须为 JSON；`Date`、`Blob`、函数不因此被放行。问题只包含路径和信息，应用不要直接回显可能带秘密的 schema 错误文本。

### 内置验证器

| 验证器 | 检查边界 |
| --- | --- |
| `jsonObjectValidator` | JSON 对象，不替代业务 schema |
| `manifestValidator` | 插件清单；依赖／提供各最多 256，环境能力最多 64；语义兼容另由预检检查 |
| `documentValidator` | 格式 `1`、最多 1000 插件及显式绑定，不装载代码 |
| `hostEnvironmentValidator` | `browser/node` 与能力数组 |
| `hostReadinessValidator` | 唯一的必需插件 ID，最多 1000 |
| `nodeListenerValidator` | 默认 `127.0.0.1:0`，整数端口 `0—65535` |
| `configurationSourcesValidator` | 来源、JSON 字段和 64 层限制 |
| `apiEnvelopeValidator` | 协议 `1`、UUID、成功数据或安全错误码 |
| `uiPositionValidator` | 位置字段，实际拥有关系由注册表检查 |
| `uiContributionValidator` | JSON 元数据、最多 64 个子出口；不接 `select` 函数，动态注册另行处理 |
| `uiRouteValidator` | 静态字面量路径，最多 256 字符 |
| `uiNavigationValidator` | 标识、标签、路由引用及可选整数顺序 |
| `uiThemeValidator` | 标识及受限 `--cw-*` 值，不接任意脚本／CSS |

标识通常为首尾无空白的 `1—200` 字符文本；`priority/order` 范围为 `−10000—10000`。完整约束结合公开签名和运行时校验结果阅读，结构验证不等于权限检查。

## 版本适配

```ts
import { isVersion, isRange, matchesVersion } from 'cordis-web-framework/version-semver';

console.log(isVersion('1.2.3'));                   // true
console.log(isRange('^1'));                       // true
console.log(matchesVersion('1.2.3', '^1'));        // true
console.log(matchesVersion('2.0.0', '^1'));        // false
```

| 函数 | 返回与限制 |
| --- | --- |
| `isVersion(text)` | 仅精确规范版本为 `true`，不宽松解析或强制转换 |
| `isRange(text)` | 拒绝空范围 |
| `matchesVersion(version, range)` | 使用 semver 默认预发布语义；接纳预发布版需明确范围 |

三者只返回布尔值，不发起安装、升级或联网。版本比较通过也不保证行为兼容。

## createLogger

创建结构化日志接口，不保证可靠存储、轮转或排空。

```ts
import { createLogger } from 'cordis-web-framework/logging';

const logger = createLogger({ level: 'info', context: { app: 'example' } });
logger.log('info', '应用启动');
const taskLogger = logger.child({ taskId: 'task-1' });
taskLogger.log('info', '任务完成', { count: 3 });
```

### 选项

| 选项 | 默认值 | 用途 |
| --- | --- | --- |
| `level` | `info` | `debug/info/warn/error/silent` |
| `context` | 空 | 固定上下文字段，子字段不能覆写父上下文 |
| `write` | 对应 console | 输出单行结构化 JSON，可异步 |
| `maxPendingWrites` | `32` | 在途上限，整数 `1—1024` |
| `onOutputError` | 未配置 | 输出失败或超量丢弃通知 |

事件包含 ISO 时间、级别、消息和结构化字段。消息最多 1024 字符，字符串字段最多 512，对象／数组最多 32 项，另有深度与总预算限制。常见敏感字段会脱敏，但自由文本不保证自动识别秘密；不要记录凭据、原始请求体或素材。

`log()` 与 `child()` 不提供持久化确认。输出超量会丢弃并通知，不无限缓存；输出器或观察器异常不应破坏业务。需要排空、存储或轮转时，由应用管理输出器，Logger 本身没有 `flush/close` 承诺。类型见[公开签名](signatures.md)。

## createShutdownController

观察关闭预算与真实清理结果，不强杀任务。

### 最小示例

```ts
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { createShutdownController } from 'cordis-web-framework/shutdown';

export async function runShutdownExample() {
  const runtime = createCordisRuntime();
  const shutdown = createShutdownController(runtime, { timeoutMs: 5000 });
  const before = shutdown.inspect().state;
  const result = await shutdown.stop();
  return { before, after: result.state };
}
```

预期返回 `{ before: 'running', after: 'stopped' }`。此处运行时没有在途业务；真实应用应检查清理错误，而不是总假设正常停止。

### 方法和状态

| 方法 | 行为 |
| --- | --- |
| `inspect()` | 读取当前 `ShutdownSnapshot`，初始 `running` |
| `stop()` | 发起关闭；重复调用共享 Promise；预算内返回 `stopped/cleanup-failed`，到期返回 `timed-out` |
| `completion()` | 同样会发起关闭，但等待真实收尾，可能无限等待 |

`timeoutMs` 默认 `5000`，必须为 `1—2147483647` 的整数，否则抛 `TypeError`。

正常状态为 `running → stopping → stopped/cleanup-failed`。观察预算到期可先返回 `timed-out`，实际收尾后 `inspect()` 更新；已返回的旧快照保持不变。快照保留运行时结果和可选错误。

> 不要提前调用 `completion()` 来“订阅将来退出”：它会立即发起关闭。超时不等于资源已释放，控制器不解除所有权，也不重开实例。

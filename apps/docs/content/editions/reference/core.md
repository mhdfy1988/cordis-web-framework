# 运行与插件装配

用服务标识连接提供者与消费者，先预检，再激活，最后检查真实就绪状态。第一次使用请先看[插件教程](../guide/plugins.md)。

## 标识和类型

### 服务标识

```ts
import { service } from 'cordis-web-framework';

interface Greeting { greet(name: string): string }
const greeting = service<Greeting>('example.greeting');
```

`service<T>(id)` 返回冻结的 `ServiceKey<T>`。ID 必须是非空、非空白字符串，否则抛 `TypeError`。相同服务应共用标识和版本，不由每个应用各拼一套名字。

> `T` 只提供静态类型：创建服务标识不会实例化服务，也不会验证外部输入。

### 定义、目录与装配文档

| 类型 | 负责什么 |
| --- | --- |
| `PluginDefinition` | 底层运行定义：服务键数组和 `setup` |
| `RegisteredPlugin` | 带清单与纯配置校验的装配模块 |
| `PluginCatalog` | `entry → RegisteredPlugin` 的只读 Map |
| `CompositionDocument` | 格式 `1` 的插件声明和显式绑定数据 |

两种插件定义不能混用。正常应用优先使用 `definePlugin` 与装配文档，不另写兼容性检查器。

清单 `PluginManifest` 必填 `id`、精确 `version`、`apiVersion`、`requires`、`provides`；可选 `host` 声明平台和能力。依赖写服务 `id/range`，提供写服务 `id/version`。装配项的 `config` 可以省略，`bindings` 明确服务由哪个插件提供。

所有外部结构和 JSON 输入都受运行时校验；TypeScript 类型不是可信边界。

## definePlugin

### 输入与返回

| 参数 | 用途 |
| --- | --- |
| `manifest` | 身份、版本、依赖、提供能力和可选宿主约束 |
| `config` | `ConfigValidator<T>`，纯配置校验器 |
| `setup(scope, config)` | 激活时申请资源、消费和提供服务 |

返回 `RegisteredPlugin`。定义时不执行 `setup`；准备阶段解析并冻结配置，成功后生成运行定义。校验器不能读文件、发请求或申请业务资源。需要默认值时在 Zod schema 中明确声明，不在异常后回退旧配置。

### 最小示例

下面的完整函数可在安装当前框架和 Zod 的 Node 工程调用。消费者故意放在数组前面，激活仍由服务依赖决定。

```ts
import { z } from 'zod';
import { service } from 'cordis-web-framework';
import { definePlugin, assembleComposition } from 'cordis-web-framework/composition';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { zodConfig } from 'cordis-web-framework/validation-zod';

export async function runPluginExample() {
  const greeting = service<{ greet(name: string): string }>('example.greeting');
  let answer = '';
  let released = 0;
  const provider = definePlugin({
    manifest: {
      id: 'greeting', version: '1.0.0', apiVersion: '^1', requires: [],
      provides: [{ id: greeting.id, version: '1.0.0' }],
    },
    config: zodConfig(z.strictObject({ prefix: z.string().min(1) })),
    setup(scope, config) {
      scope.onDispose(() => { released++; });
      scope.provide(greeting, { greet: name => `${config.prefix}，${name}` });
    },
  });
  const reader = definePlugin({
    manifest: {
      id: 'reader', version: '1.0.0', apiVersion: '^1',
      requires: [{ id: greeting.id, range: '^1' }], provides: [],
    },
    config: zodConfig(z.strictObject({}).default({})),
    setup(scope) { answer = scope.get(greeting).greet('小林'); },
  });
  const runtime = await assembleComposition({
    formatVersion: 1,
    plugins: [
      { id: 'reader', version: '1.0.0', entry: 'reader' },
      { id: 'greeting', version: '1.0.0', entry: 'greeting', config: { prefix: '你好' } },
    ],
    bindings: { [greeting.id]: 'greeting' },
  }, new Map([['greeting', provider], ['reader', reader]]), {
    createRuntime: createCordisRuntime,
  });
  const ready = runtime.audit().ready;
  await runtime.close();
  return { answer, ready, released };
}
```

### 预期结果

```json
{ "answer": "你好，小林", "ready": true, "released": 1 }
```

### 作用域规则

| 方法 | 允许的操作 |
| --- | --- |
| `scope.get(key)` | 只取已经声明的依赖 |
| `scope.provide(key, value)` | 只发布已经声明的能力 |
| `scope.onDispose(cleanup)` | 登记本插件退出时的实际清理 |
| `scope.signal` | 把生命周期取消传给异步任务 |

停止后不能继续读服务或登记资源，错误保留在运行快照诊断中。不要把作用域保存为全局“当前用户”。

## validateComposition

预检不会创建运行时或申请业务资源。适合先检查用户装配数据，再决定是否启动。

```ts
import { validateComposition } from 'cordis-web-framework/composition';

// document、catalog 来自应用维护的装配数据和可信模块目录。
const result = validateComposition(document, catalog);
if (!result.ok) {
  console.log(result.issues); // code、path，以及可选的插件／服务标识。
}
```

| 输入／输出 | 说明 |
| --- | --- |
| `document` | JSON 数据或 JSON 字符串 |
| `catalog` | 可信插件目录，不是任意 URL 下载器 |
| `apiVersion` | 可选，默认插件 API `1.0.0` |
| `environment` | 可选；声明了平台要求时必须提供相符环境 |
| 成功 | `{ ok: true, plan }` |
| 拒绝 | `{ ok: false, issues }` |

预检包括结构、身份、版本、配置、绑定、循环和平台要求。`ValidationIssue.path` 是字段路径；装配问题额外包含 `code`，以及可选的 `pluginId/serviceId`。

> `plan` 是只读结果，不是绕过下一次验证的令牌。裸装配负责提供实际环境，宿主则提供自身检测结果。

## assembleComposition

输入 `document`、`catalog` 和 `{ createRuntime, apiVersion?, environment? }`，成功返回独立 `Runtime`。

| 情况 | 结果 |
| --- | --- |
| 预检拒绝 | 抛 `CompositionRejectedError`，保留 `issues` |
| 激活异常或未就绪 | 先关闭本次运行时，再抛 `CompositionStartError`，保留 `snapshot` |
| 所有必需能力真实就绪 | 返回运行时 |

`createRuntime` 必须返回新实例，不能混入以前未审计的插件。不采用“部分成功后继续跑旧插件”的方式。

异步 `setup` 不合作、或清理永不完成时，不承诺启动看门狗或硬中断。等待 `settle()` 返回不是启动成功的充分条件。

## createCordisRuntime 与运行句柄

`createCordisRuntime()` 无参数，创建一个运行时。修复后的 Cordis 已内置，消费方不直接使用 Cordis 对象；句柄只属于创建它的实例。

| 方法 | 返回／时序 | 调用方责任 |
| --- | --- | --- |
| `Runtime.load(definition)` | `PluginHandle`，可能进入 `waiting/starting` | 重复身份、关闭后装载、定义错误不能算成功；激活错误看诊断 |
| `PluginHandle.inspect()` | 当前插件快照 | 不能修改快照来控制运行时 |
| `PluginHandle.settle()` | 等当前变动收尾 | `waiting` 也可能返回，不保证 `ready` |
| `PluginHandle.stop()` | 等真实清理，返回终态快照 | 检查 `stopped/cleanup-failed`；重复调用共享清理 |
| `Runtime.inspect()` | 运行快照 | `closed` 只说明禁止新装载，不说明已释放 |
| `Runtime.settle()` | 当前运行变动收尾的快照 | 之后仍需 `audit()` |
| `Runtime.audit(ids?)` | `ready/issues` | 默认全部插件；显式名单可报告 `not-loaded`，不隐藏其他诊断 |
| `Runtime.subscribe(listener)` | 撤销函数 | 所有者结束时撤销；观察错误保留诊断，不破坏核心流程 |
| `Runtime.close()` | 按依赖等待清理的最终快照 | 幂等、不强杀悬挂任务、不重开已关闭实例 |

## 状态与诊断

### 状态如何变化

正常启动：`waiting → starting → ready`。

停止：`stopping → stopped`；激活异常为 `failed`，清理异常为 `cleanup-failed`。

等待中的插件收到停止后，不会因服务后来出现而复活。干净停止后重新装配，使用新的定义实例／运行身份，不复用旧作用域。

### 快照如何阅读

| 字段 | 用途 |
| --- | --- |
| `id` | 逻辑插件身份 |
| `instanceId/generation` | 本次运行实例和代次 |
| `waitingFor` | 缺失的服务 |
| `diagnostics` | `code/phase` 和可选插件／运行标识 |

`RuntimeSnapshot` 聚合插件状态，`Readiness.issues` 指明未就绪插件。它们只读观察，不构成第二个调度器。

精确字段和所有转导出类型见[公开签名](signatures.md)，完整自校验教程见[插件示例](../examples/plugins.mjs)。

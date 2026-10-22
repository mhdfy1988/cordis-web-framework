# 编写第一个插件

让一个插件提供问候服务，另一个插件消费它；再检查错误绑定和资源清理。全程不启动 Web 服务。

| 前置 | 本教程产出 |
| --- | --- |
| 已完成[快速开始](getting-started.md)，位于 kit 的 `templates/node` 且已锁安装 | 一个可运行的双插件装配，含错误绑定和单次清理断言 |

## 第一步：运行完整教程

在 Node 模板目录执行：

```powershell
Copy-Item ../../docs/examples/plugins.mjs ./plugins.mjs
node ./plugins.mjs
```

### 预期结果

```text
错误绑定： missing-binding
你好，小林 就绪： true
清理次数： 1
```

示例使用公开包导入，断言不符会非零退出。下面直接展示同一份交付源码，不需要离开页面另找文件。

### 完整源码

<<< @/docs/examples/plugins.mjs{js}

也可[查看单独文件](../examples/plugins.mjs)。示例使用 `.mjs` 便于直接用 Node 运行；业务项目可以使用 TypeScript，框架不限制源码扩展名。

## 第二步：读懂服务、定义和装配

| 部分 | 例子里的对象 | 职责 |
| --- | --- | --- |
| 服务契约 | `tutorial.greeting` | 提供者和消费者共享服务身份；TS 项目用 `service<Greeting>()` 表达静态类型 |
| 提供者 | `greeting` | 声明提供服务，校验 `{ prefix }`，激活时发布实现 |
| 消费者 | `reader` | 声明需要服务，激活时通过作用域获取，不导入提供者实现 |
| 可信目录 | `catalog` | 目录键对应 `entry`，不是任意 URL 或文件扫描 |
| 装配数据 | `document` | 声明身份、实现版本、入口、配置及服务绑定 |

消费者先出现在数组中也能按依赖激活，不能拿数组顺序代替服务绑定。`bindings` 是“服务 ID → 提供者插件 ID”，不是组件映射。

`manifest.version` 必须与装配声明一致；`apiVersion` 是框架插件 API 范围，服务又有独立版本，不把所有版本都填成同一个包版本。

## 第三步：修改配置，再观察明确失败

1. 将源码中的 `prefix: '你好'` 与对应输出断言改成自己的前缀，再运行，观察问候变化。
2. 将 `bindings` 清空，观察预检 `missing-binding`，确认没有激活业务。
3. 将 `prefix` 改为数字，观察配置验证拒绝。
4. 恢复合法数据，再运行并确认最后清理次数仍为 `1`。

不要删除验证器、捕获错误后继续启动，或回退旧配置。用 `code/path/pluginId/serviceId` 定位输入，不打印令牌或完整秘密配置。

## 第四步：清理和异步任务

### 谁申请，谁登记释放

资源在 `setup` 激活后申请，申请完成立即用 `scope.onDispose` 登记退出动作。文件、连接、线程应登记真实关闭函数，不只是减少一个计数器。

本例用 `released === 1` 验证关闭只释放一次；重复关闭不重复释放。

### 等待不等于就绪

异步 `setup` 完成才提供就绪能力。任务接收 `scope.signal`，也要等待实际收尾。

`runtime.settle()` 等当前变动结束，缺依赖的插件仍可能处于 `waiting`；用 `runtime.audit().ready` 判断成功，再看只读快照的未就绪原因。

### 超时不等于释放

关闭预算限制的是观察等待，不强杀不合作代码。`stop()` 返回 `timed-out` 后保留句柄，通过 `inspect/completion` 观察实际结果；不要新建同一份脏资源冒充恢复。

## 放入自己的应用

保留插件定义和服务契约，将教程末尾的主动关闭改由宿主生命周期负责。

| 应用入口 | 接线方式 |
| --- | --- |
| Node | 把 document／catalog 交给 `startNodeHost`，进程入口保留 `bindProcessSignals` |
| 浏览器 | 使用 `startBrowserHost` 或 `startVueHost`，视图不另建全局运行时 |

精确类型、错误和方法见[运行与装配参考](../reference/core.md)。

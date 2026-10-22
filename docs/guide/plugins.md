# 编写第一个插件

本教程演示已可导入的可信模块装配，不是运行中安装独立插件包。后者的目标、当前限制与验收标准见[动态插件管理](../plugin-management.md)。

目标：让一个问候服务插件提供能力，另一个插件按显式绑定调用；通过配置改变结果，观察预检失败并确认资源清理。不启动 Web 服务。

前置：完成[快速开始](getting-started.md)，当前终端在新 kit 的 `templates/node`，已执行 `npm.cmd ci --ignore-scripts`。

## 第一步：运行完整教程

将交付目录的 `docs/examples/plugins.mjs` 复制为模板目录的 `plugins.mjs`。在 node 模板下执行：

```powershell
Copy-Item ../../docs/examples/plugins.mjs ./plugins.mjs
node ./plugins.mjs
```

文件是独立可运行的教程源码，不导入框架私有模块。成功输出：问候“你好，小林”、错误绑定的 `missing-binding`、运行审计 `true`，最后清理次数 `1`；任何断言不符都会非零退出。

## 第二步：读懂服务、定义和装配

教程文件分为三个职责：

1. 服务契约 `service('tutorial.greeting')`：提供者与消费者共享标识，TypeScript 应用用 `service<Greeting>(...)` 声明接口，JavaScript 本例用调用断言验证结果。
2. 两个插件：提供者声明 `provides`，纯配置验证器接收 `{ prefix }`，激活时 `scope.provide`；消费者声明 `requires`，激活时 `scope.get`，不导入提供者实现。
3. 应用装配：`plugins` 写身份、精确实现版本、目录入口和配置；`bindings` 写服务 id → 提供者插件 id。目录 Map 的键对应 entry，不是用户给的 URL 或文件路径。

消费者先列在文档中也能按依赖激活，不能用数组顺序代替服务绑定。`manifest.version` 与装配声明一致，`apiVersion` 是框架插件 API 范围，服务还拥有独立版本。

## 第三步：修改配置，再观察明确失败

打开复制后的文件，把 `prefix: '你好'` 和相应输出断言改为你自己的问候前缀，再运行。输出变化证明配置到业务的路径成立。

完整例先用空 bindings 调用 `validateComposition`，确认 `missing-binding` 且不激活，再用正确装配启动。可将 `prefix` 改为数字观察配置验证错误；不要删除验证器、捕获后继续启动或偷偷回退旧配置。诊断的 `code / path / pluginId / serviceId` 用来定位输入，日志不要打印令牌或完整配置。

## 第四步：清理和异步任务

资源在 `setup` 激活后申请；申请完立即用 `scope.onDispose` 登记所有权。示例让关闭后 `released` 恰好为 1，重复关闭不重复释放。真实文件、连接和线程应登记实际关闭函数，不只是减一个计数器。

异步插件应让 `setup` 完成才提供就绪能力；需要取消的任务接收 `scope.signal`，也要等待实际任务收尾。不要这样认为：`await runtime.settle()` 返回了，所以缺依赖的插件也就绪。正确判断是 `runtime.audit().ready`，失败时检查只读快照。

停止预算只限制等待观察，不强杀不合作的代码。使用 `createShutdownController` 的 `stop()` 后若得到 `timed-out`，仍保留句柄，用 `inspect / completion` 观察真实结果；不能重建同一脏资源冒充恢复。

## 放入自己的应用

保留定义和服务契约，将最后的主动关闭换成宿主的生命周期管理。Node 模板的 `application.mjs` 返回 `startNodeHost`；把自己的 document、catalog 交给它，进程入口继续用 `bindProcessSignals`。浏览器则使用 `startBrowserHost` 或 `startVueHost`，不要让视图自己另建全局运行时。

更完整的类型、错误及方法见 [运行与装配参考](../reference/core.md)。

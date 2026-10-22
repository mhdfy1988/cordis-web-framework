# 排错指南

先确认运行对象：源码示例、当前 dist、本地 tarball、模板还是线上站点；记录实际 Node／浏览器版本、命令、配置来源与包摘要。不要先删依赖、升级所有库或反复打包重试。

| 现象 | 检查什么 | 处理边界 |
| --- | --- | --- |
| 找不到公开模块或导出 | 是否先 build，安装的是哪份 tgz，是否使用列出的入口 | 不用私有 `src` 路径绕过，消费者不自行给原始 Cordis 打补丁 |
| 安装出现环境不匹配 | Node 是否在声明范围、npm 版本、模板相对包路径是否仍存在 | 保留准确错误；网络失败不等于框架运行错误 |
| `CompositionRejectedError` | `issues` 的 code/path/pluginId/serviceId | 预检失败没有激活；修输入，不忽略并继续启动 |
| `missing-binding / invalid-binding` | 消费服务是否有显式绑定、提供者是否声明该服务 | 绑定是服务 id→插件 id，不是 entry→组件名 |
| 版本／宿主不兼容 | 插件 API、实现版本、服务范围和平台能力分别核对 | 不能把所有 version 填相同值，预发布版不默认冒充稳定版 |
| `CompositionStartError` | 错误快照中的激活／清理诊断，setup 是否申请后未登记清理 | 预检成功不等于激活成功，不回退旧实现 |
| `settle()` 已返回但不就绪 | `audit()`、waitingFor、必需插件名单 | 等待缺依赖可正常返回，不能用 Promise 完成当成功 |
| 宿主启动后失败 | `HostStartError.shutdown`、`.host.inspect()` | 超时后保留 `.host.completion()` 观察，未完成释放不要复用 DOM |
| HTTP 503 | `/health/ready`、必需插件是否就绪、是否正在停止 | 区分可选扩展与必需插件；不简单忽略全部 failed |
| 客户端 `invalid-response` | MIME、协议、信封、请求标识、状态码和业务输出 | 不能把 HTML 404 或重定向当作 JSON；不吞错误返回空数据 |
| 保存取消后不确定是否成功 | 请求标识、服务端记录和修订，重新读取 | 保留草稿，核对后再操作，不盲目重试写入 |
| 界面为空／扩展不可用 | 位置是否声明、scope、版本、令牌、view 目录和诊断 | root 外需所属访问令牌，chain 组件故障不自动改选 |
| 页面键变成 undefined | Vue 包装层 props 与 attrs 是否覆盖 entryKey | 明确 props 或 `inheritAttrs: false`，不改 registry 掩盖问题 |
| 命令 disabled/busy/missing | 启用条件、同会话在途动作、是否被撤销 | 按返回状态提示，不重复注册或复制业务到按钮 |
| 关闭一直 stopping/timed-out | 哪个真实在途处理器、任务或 onDispose 未完成 | 超时不是释放；completion 会发起关闭并可能无限等，不能提前拿来订阅退出 |
| Worker／资源 404 | HTTP(S)、静态子路径、JS MIME、Worker 同源、相对路径 | 不双击 HTML，不用旧算法静默兜底 |
| `verify:delivery` 拒绝 | 报告变化的输入／候选路径，核对当前来源 | 修改文档也可能使旧候选失效；重新验收，不手改摘要假装通过 |

## 怎样观察状态

用 `runtime.inspect()` 观察插件身份、代次、state、waitingFor 和诊断；用 `audit(requiredIds?)` 判断必需能力。`subscribe` 返回撤销函数，观察者不能代替运行时真值。插件 id 相同不代表 instanceId 相同，重启后不要复用旧作用域。

宿主通过 `inspect().state` 区分 ready、not-ready 和关闭状态。原始运行时的 `closed` 只是“不再接收装载”，不代表清理完成。有预算的 stop 返回后，必要时继续检查实际收尾。

JSON 错误用服务端生成的 requestId 关联日志，不提交认证头、完整配置、用户图片、数据库或个人路径到公开 Issue。复现材料最少应包含：版本、实际入口、步骤、预期与实际结果、脱敏诊断、是否稳定复现。最小复现应保留原配置来源，不能一次用显式配置、下一次回默认配置后比较。

## 当前已知限制

固定 Cordis 预发布版和补丁仍是维护责任；SQLite 样例是实验性单进程用途。此前生产依赖审计为 0 告警，开发补丁工具链曾有 4 条高危告警；历史结果不是当前安全证明，发布前需重新评估，不能 `npm audit fix --force` 自动降级破坏补丁工具链。

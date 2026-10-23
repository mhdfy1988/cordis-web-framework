# cordis-web-framework

以 Cordis 为运行基础的 Web 框架：通过公开契约装配可信插件，分别运行浏览器工具、Node 服务和全栈应用。应用拥有业务，框架提供装配、生命周期、宿主和可替换的界面扩展。

当前预发布版本 `0.1.0-rc.2`，自有代码采用 [MIT](https://github.com/mhdfy1988/cordis-web-framework/blob/main/LICENSE)。[完整文档应用](https://mhdfy1988.github.io/cordis-web-framework/) · [GitHub 预发布与交付包](https://github.com/mhdfy1988/cordis-web-framework/releases)。暂不上 npm，不要从注册表猜装同名包。正式认证、生产存储和不可信插件安全沙箱不在当前能力中。

## 开始使用

插件管理由框架统一提供：支持可信独立 JSON／ESM 包的运行中安装、启停、卸载、持久意愿和重启恢复；没有管理页面也可使用。包自身独立构建，宿主不重建。浏览器／Node 分别适配存储和加载，当前不提供插件市场、自动升级或不可信沙箱。操作示例见[动态插件管理教程](docs/guide/plugin-management.md)，来源与验收边界见[专题说明](docs/plugin-management.md)。

也支持符合框架接口的 npm 格式插件包：Node 可从本地目录、`.tgz` 或 registry 精确版本安装到独立包库；普通依赖交 npm，安装脚本禁用。浏览器导入包的预构建交付 JSON，支持图片／样式及共享模块，不执行 npm。可选 Vue 管理面板提供文件导入、安装、启停和卸载，见同一教程；管理面板不是能力前提。

从 GitHub Release 获取 kit 或克隆本仓源码。推荐阅读：

1. [能力与核心概念](docs/guide/concepts.md)：判断是否适用，了解限制。
2. [快速开始](docs/guide/getting-started.md)：从新目录安装、启动、验证并停止。
3. [插件开发](docs/guide/plugins.md)：声明、配置、服务依赖与资源清理。
4. [界面扩展](docs/guide/ui.md)或[前后端通信](docs/guide/communication.md)：按应用需求继续。

完整入口：[开发者手册](docs/guide/index.md) · [模板与示例](docs/guide/templates.md) · [API 参考](docs/reference/index.md) · [排错指南](docs/guide/troubleshooting.md) · [测试与交付](docs/guide/delivery.md)。

## 选择应用形态

| 形态 | 使用方式 | 示例与限制 |
| --- | --- | --- |
| 纯浏览器 | 核心＋浏览器宿主＋前端插件，输出静态资源 | PNG 缩放，无后台 API，需现代浏览器本地处理能力 |
| Node 服务 | 核心＋HTTP 宿主＋服务插件 | 就绪探针、受控退出；不强制安装 Vue |
| 全栈 | 两端独立装配，经严格 JSON 契约通信 | 记录编辑／保存；演示身份与实验性 SQLite 不可当生产方案 |

当前可用能力包括配置、结构化日志、诊断、有界关闭观察、四种界面位置、命令、路由和主题；默认实现可按契约替换，不承诺任意生产热更新或所有 Cordis 生态插件兼容。

## 维护与验证

源码根目录使用 Node 24.14.0、npm 11.9.0；真实浏览器检查需要本机 Chrome。首次本地交付：

```powershell
npm.cmd ci --no-audit --no-fund
npm.cmd run build
npm.cmd run check:reference
npm.cmd run test:delivery
npm.cmd run verify:delivery
```

`test:delivery` 包含源码回归、工程外同包消费、教程、三个应用模板及两种插件模板的真实运行，不启动用户常驻服务。候选和证据在 `output/delivery-result.json`，源码／使用文档／模板变化后旧证据失效。`check:release` 校验版本、许可、日志与当前候选，不自动上传。`npm publish` 被显式保护，发行渠道仅为 GitHub Releases。

## 文档应用与 Pages

`apps/docs` 是独立消费应用，只安装其 `kit/framework.tgz`，不直接导入框架源码。VitePress 仅用于构建期 Markdown／高亮，页面运行、插件组合、搜索、布局及管理入口由本框架应用承担。运行 `npm.cmd run build:pages` 会按应用锁安装、同步文档、构建并验收静态产物；输出 `apps/docs/output/documentation-site`，不需要后台服务。

根目录维护框架、`docs` 维护文档源、`templates` 提供应用／插件起点。Pages 工作流只上传静态站，不发布实验性 SQLite 或本机身份服务。预发布的开发／构建依赖仍须在受信任环境使用，`npm audit` 结果不能由历史测试代替；不可信插件、自动升级和生产认证不在本版承诺中。

开发样例运行和数据目录见[模板说明](docs/guide/templates.md)，各测试与生成命令见[交付指南](docs/guide/delivery.md)。完整依赖与平台声明以 package.json／锁文件为准，不将一次测试泛化为所有平台已支持。

## 项目资料

- [更新日志](CHANGELOG.md)：各版本修复及尚未发布的变化。
- [第三方声明](THIRD_PARTY_NOTICES.md)：内置修复和依赖许可。
- [架构与研发记录](docs/records.md)：阶段决策、来源及当时的证据。
- [唯一实施计划](docs/implementation-plan.md)：当前推进状态。

文档应用安装、预览和部署维护见[文档站维护](docs/guide/documentation.md)，正文直接复用仓库 Markdown，支持中文搜索、目录和代码复制。文档按当前使用、历史记录与未来计划分区；示例核对不替代独立开发验收，线上版本以部署结果为准。

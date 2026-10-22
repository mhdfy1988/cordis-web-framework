# 公开 API 参考

所有路径以 `cordis-web-framework` 开头，不能导入 `src` 或未导出的 `dist` 子路径。当前 ESM，不提供 CommonJS require 入口。精确参数／接口成员见[生成签名](signatures.md)，以下语义参考说明默认值、副作用和资源责任。可运行用法见[插件教程](../guide/plugins.md)、[界面教程](../guide/ui.md)和[通信教程](../guide/communication.md)。

## 公开入口覆盖表

每一个 package.json 导出都必须在这里有落点；签名页再逐个列出该入口实际导出的符号（包括转导出的类型）。这表示参考覆盖，不是所有调用组合都经过真实运行。

| 导入入口 | 语义参考 | 依赖／环境 |
| --- | --- | --- |
| `cordis-web-framework/management` | [动态插件管理](../plugin-management.md) | 无界面管理、包完整性与临时存储 |
| `cordis-web-framework/contracts/management` | [包与管理契约](../plugin-package.md) | 平台无关契约 |
| `cordis-web-framework/hosts/browser/plugins` | [动态插件管理](../plugin-management.md) | IndexedDB、Web Locks、Blob、DOM 资源 |
| `cordis-web-framework/hosts/node/plugins` | [动态插件管理](../plugin-management.md) | Node 文件存储与 ESM 导入 |
| `cordis-web-framework/presentation-vue/catalog` | [动态插件管理](../plugin-management.md) | 可撤销 Vue 组件目录 |
| `cordis-web-framework/presentation-vue/management` | [安装与管理](../guide/plugin-management.md) | 可选 Vue 插件包面板 |
| `cordis-web-framework/http-json/registry` | [动态插件管理](../plugin-management.md) | 动态 JSON 端点与文本资源注册 |
| `cordis-web-framework` | [运行／装配](core.md) | 契约，不自动启动实现 |
| `cordis-web-framework/runtime` | [运行／装配](core.md) | 运行契约与 service |
| `cordis-web-framework/runtime-cordis` | [运行／装配](core.md) | 内置已修复 Cordis；不安装原始 Cordis |
| `cordis-web-framework/composition` | [运行／装配](core.md) | 定义／预检／装配 |
| `cordis-web-framework/contracts/composition` | [运行／装配](core.md) | 清单、配置验证和装配类型 |
| `cordis-web-framework/config` | [配置／日志／关闭](foundation.md) | JSON 配置来源与快照 |
| `cordis-web-framework/logging` | [配置／日志／关闭](foundation.md) | Consola 适配，浏览器／Node |
| `cordis-web-framework/shutdown` | [配置／日志／关闭](foundation.md) | 有界关闭观察 |
| `cordis-web-framework/validation-zod` | [配置／日志／关闭](foundation.md) | 应用写 schema 应显式依赖 Zod 4.6.7 |
| `cordis-web-framework/version-semver` | [配置／日志／关闭](foundation.md) | 严格版本／范围 |
| `cordis-web-framework/contracts/host` | [宿主／HTTP](hosts-http.md) | 平台无关契约 |
| `cordis-web-framework/hosts/browser` | [宿主／HTTP](hosts-http.md) | DOM、独立空容器 |
| `cordis-web-framework/hosts/node` | [宿主／HTTP](hosts-http.md) | Node 24、Fastify HTTP |
| `cordis-web-framework/presentation-vue` | [宿主／HTTP](hosts-http.md) | 可选 peer Vue `^3.5.44` |
| `cordis-web-framework/contracts/http` | [宿主／HTTP](hosts-http.md) | JSON 操作／上下文／信封／资源类型 |
| `cordis-web-framework/http-json` | [宿主／HTTP](hosts-http.md) | fetch 客户端、端点与安全错误 |
| `cordis-web-framework/contracts/ui` | [界面](ui.md) | 不依赖 Vue 的界面契约 |
| `cordis-web-framework/ui` | [界面](ui.md) | 位置选择／注册，无 DOM |
| `cordis-web-framework/contracts/commands` | [界面](ui.md) | 命令上下文／定义／结果 |
| `cordis-web-framework/commands` | [界面](ui.md) | 无界面命令注册表 |
| `cordis-web-framework/contracts/navigation` | [界面](ui.md) | 路由、导航和主题数据 |
| `cordis-web-framework/presentation-vue/ui` | [界面](ui.md) | 可选 Vue、可信组件目录 |
| `cordis-web-framework/presentation-vue/routing` | [界面](ui.md) | Vue 与 Vue Router `^4.6.4` |
| `cordis-web-framework/presentation-vue/controls` | [界面](ui.md) | DOM 容器快捷键和主题 |

## 类型如何阅读

签名中的 `readonly` 是调用约定，只有对应实现明确冻结时才提供运行时不可写保护；TypeScript interface 不是网络输入校验。`Cleanup` 可异步，但 UI 声明等待的 install／撤销必须同步，两者不可混用。

`PreparedPlugin` 目前也经公开契约转导出，但它只用于装配接线，不建议应用调用 `prepare()` 绕过全量预检。返回句柄和快照的详细成员均随声明生成，不需要阅读运行时私有类。

当前手册和生成签名是当前语义入口，阶段记录用于核对证据。外部依赖变化由锁和兼容基线管理，不能以本文的版本范围推断任意未来版本已经验收。

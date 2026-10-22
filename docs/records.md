# 架构与研发记录

这里保存项目背景、来源、阶段决策和当时的测试证据。不是入门教程；当前使用从[开发者手册](guide/index.md)开始，接口查[API 参考](reference/index.md)。

| 资料 | 用途 |
| --- | --- |
| [整体能力地图](web-framework-plan.md) | 长期范围与非目标，不表示全部实现 |
| [初始架构基线](architecture-baseline.md) | W0 决策与所有权背景 |
| [唯一实施计划](implementation-plan.md) | 当前执行指针及追加记录 |
| [复用来源](reuse-evidence.md) | 源码来源及验证边界；相邻仓引用不是使用前置 |
| [W1](w1-core.md) | 公共核心、补丁、配置、日志、关闭 |
| [W2](w2-hosts.md) | 浏览器与服务端宿主 |
| [W3](w3-fullstack.md) | 最小全栈、权限／存储夹具、取消语义 |
| [W4](w4-ui.md) | 界面贡献、布局替换和适配 |
| [W5](w5-browser-tool.md) | 纯浏览器第二业务及实际输出 |
| [W6](w6-delivery.md) | 本地包、模板、版本与交付门禁 |

## 历史来源说明

历史阶段里的“尚未实现／后续”按该文日期理解，不覆盖当前手册。部分来源材料指向当时本机相邻 FluidBlock 仓库，独立取得本仓时可能不可用；当前教程、API 和模板不依赖它。文档站将这些旧引用明确映射到本节，不复制外仓内容或声称原资料已公开。Cordis 来源与许可随包的 THIRD_PARTY_NOTICES 和 patches/README 可独立查询，不要求下载产品旧仓。

## W8 文档站实现与来源

2026-10-22：文档工具独立放在 docs-site，锁定 VitePress 1.6.4；正文映射由 model.mjs 维护，公开 API 继续从 dist 声明生成，不复制维护另一份签名。构建、检查、静态服务和浏览器验收分别在 scripts/docs-build.mjs、docs-check.mjs、docs-static.mjs、docs-browser-check.mjs；框架 src 不参与本轮改造。站点产物独立于框架包，工具配置和锁文件参与交付输入摘要。

源码证据：VitePress 1.6.4 的 dist/node/chunk-D3CUZ4fa.js 内 md.renderer.rules.link_open 负责添加 base，项目链接转换不再预先拼 base；哈希文件名可能随版本变化，升级后按行为重新核对。dist/client/theme-default/components/VPLocalSearchBox.vue 使用焦点陷阱和异步组件，真实 Chrome 验证发现 Escape 卸载后焦点会落到 body；主题扩展只在这一明确状态恢复搜索按钮。VPSidebar.vue 使用 CSS 转场，截图等待实际退出可见区域，不拿转场中间帧当最终布局。解析器自动加入的标题锚点 HTML 与正文未转义泛型必须区分；测试保留断链、错锚点、未转义泛型和非法基础路径负例。

原生 Markdown 构建初期暴露了未加代码标记的泛型，以及错误重复拼接基础路径；分别修正文档语法和统一链接转换后，静态构建通过。没有用忽略断链、旧页面回退或手改依赖绕过。中文搜索使用 Intl.Segmenter；示例源码提供文本下载，并继续在工程外消费包执行，不在文档站伪装成在线沙箱。

选型官方依据及文档工具审计的 1 high／2 moderate、稳定线维护成本见[文档站维护](guide/documentation.md)。完整类型签名页面当前单个压缩脚本约 513 KB，构建保留体积警告；尚未为此拆 API 文档或提高告警阈值。此成本只属于文档页，不是框架运行包。默认站点路径和实际验证结果以 output/docs-check-result.json 为准；W9 独立开发与 W10 Pages 不在本轮完成范围。

## W7 开发者文档记录

2026-10-22：新增 guide 的能力／术语、快速开始、插件、界面、通信、模板、排错、工程交付章节；reference 的四类语义参考与入口覆盖表；完整 Node 插件、HTTP 和 Vue 教学文件。README 转为使用入口，原阶段材料保留，不批量改写历史。

覆盖映射：W1 运行／装配→reference/core，配置／日志／关闭→reference/foundation；W2 宿主和 W3 通信→reference/hosts-http；W4 界面组合→reference/ui；W5／W6 业务样例与模板→guide/templates 与 guide/delivery。当前手册独立叙述语义，不要求读者到历史记录中拼 API。

签名工具复用既有 TypeScript 5.9.3 编译器 API，读取 dist 的 24 个公开入口及 178 个导出项（含转导出），生成 signatures.md；没有新安装文档依赖，没有自制 TypeScript 解析器。依据为 [TypeScript 官方编译器 API 说明](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)。合法转导出与遗漏新入口的负例均验证，当前声明和保存签名一致。

本轮 Node 回归 136 项通过。test:guide 在工程外以本地 tarball 安装，教程从包内 docs/examples 复制：插件例验证配置／绑定／就绪／单次释放，HTTP 例真实请求回读，Vue 例以消费方自身 esbuild 构建，在 Chrome 155.0.8059.85 实际点击／键盘执行及停止，桌面焦点和窄屏悬停截图已目视检查。教学例保持原生最小布局，不是文档站设计。包消费门禁复用该教程验收，确保不只运行本仓源码。

文档本地文件链接与 UTF-8 已核对；锚点／站内搜索等文档站门禁留到 W8。W9 的全新业务独立开发尚未开始，本轮由作者核对示例不能冒充外部开发者盲测。正式发布、Pages、跨浏览器／多操作系统验证均未执行。没有刷新安全审计；历史告警继续保留，不能称完整安全通过。

维护经验：当前使用语义与历史阶段分区；公开签名单源生成，完整教程随包分发并在工程外运行。文档或包内容变化会使交付证据失效，最终以重新验收的 output/delivery-result.json 为准。

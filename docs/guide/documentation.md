# 文档站维护

本地文档站使用独立 `docs-site` 工具包中的 VitePress 1.6.4（MIT），默认主题与本地全文搜索。正文仍来自本仓 Markdown，`.generated` 是构建输入副本，不手工维护；框架运行依赖、公开契约和应用构建不导入文档工具。

## 构建与预览

在源码根目录：

```powershell
npm.cmd ci --no-audit --no-fund
npm.cmd ci --prefix docs-site --ignore-scripts --no-audit --no-fund
npm.cmd run docs:build
npm.cmd run docs:preview
```

打开输出的随机回环地址。`docs:preview` 只提供 `output/docs-site` 的静态文件，不使用 Vite 的开发／预览服务器。用 Chrome 阅读，Ctrl+C 退出；不会替换已有应用服务。默认基础路径 `/cordis-web-framework/` 只是本地验证约定，不表示存在同名 GitHub 仓库。

将来确认托管地址后，可显式设置 `DOCS_BASE_PATH`，例如 `/manual/` 或 `/`，重新构建和验收；不在旧产物上替换字符串。只接受字母数字、短横线和下划线组成的路径段，不接受任意 URL。

## 内容和导航

入门、教程、API 与指南为主阅读路线，架构／研发记录作为次级栏目。页面目录、窄屏菜单和代码复制沿用默认主题；主题扩展只补搜索框 Escape 关闭后的焦点恢复，不为文档再实现框架自己的插件界面。中文搜索使用平台 Intl.Segmenter 词分割配置，索引和查询同口径；无外部搜索账户，不上传搜索词。生产目标是现代 Chrome，其他浏览器需单独验收。

`docs-site/model.mjs` 映射正文到站点路径，VitePress Markdown 解析器处理链接和锚点。示例 `.mjs/.html` 作为 `.txt` 静态源码供阅读，不在站点自动执行；本地 kit 中仍保留真实可运行文件。README、CHANGELOG、第三方声明和补丁说明只映射展示，不维护第二份正文。

相邻 FluidBlock 的历史引用不复制外仓内容、不伪装为可用来源；站内明确跳到[历史来源说明](../records.md#历史来源说明)。源码 Markdown 仍保留原引用供内部溯源，当前使用主线不得依赖它。其他未映射的本地链接必须失败，不能全局 ignoreDeadLinks。

## 文档检查

`check:docs` 核对实际文档的目标页／锚点与公开 API 签名；合法、断链、错锚点、未知本地路径和基础路径负例需保持。`test:docs` 使用生产静态构建和 Chrome，检查子路径、直接访问与刷新、导航、中文搜索、键盘关闭、代码复制、浅／深色与窄屏，并保留截图。教程执行仍复用 `test:guide` 和同包消费，不把代码展示当成实际执行。

文档／工具配置变化会使 W6 交付证据失效；完成后重跑受影响的包与模板验收，不手改摘要。API 签名更新先 build，再 docs:reference；签名展示不等于所有调用组合都支持。

`test:docs` 的报告在 `output/docs-check-result.json`，截图在 `output/docs-check`；框架包／模板报告仍为 `output/delivery-result.json`。站点静态文件独立保存在 `output/docs-site`，不作为框架运行依赖或打入框架 tarball。预览会核对文档输入和产物摘要，拒绝陈旧／被修改的文件。

## 选型与风险

选择 VitePress 是因为默认文档主题、静态构建、Markdown 支持、本地搜索与子路径配置直接满足当前需求。对比 VuePress 可行，但当前无需更大的可插拔站点系统；不自写搜索／路由，也不为此把框架改成 React 或引入在线后端。

选择官方稳定线 1.6.4，而不是当时的 2.0.0-alpha.20；接受其旧工具链维护成本。安装审计发现文档工具树 1 条 high、2 条 moderate（涉及 Vite 开发服务与旧 esbuild）；**没有修复这些依赖漏洞**。当前只用可信本地内容执行构建，不启动 Vite 服务，生产静态文件由独立固定文件服务预览。该隔离降低相关暴露，不是完整安全保证；正式发布前重新审计，稳定升级可用或边界变化时重评，不用未验证 overrides 或强制升级掩盖风险。

官方依据：[VitePress 说明](https://vuejs.github.io/vitepress/v1/guide/what-is-vitepress)、[本地搜索](https://vuejs.github.io/vitepress/v1/reference/default-theme-search)、[基础路径与部署](https://vuejs.github.io/vitepress/v1/guide/deploy)。准确间接版本由 docs-site/package-lock.json 固定。文档站目前只在本地构建，GitHub Pages 属 W10，尚未上线。

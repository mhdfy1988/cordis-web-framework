# 文档站维护

当前在线文档由本仓 `apps/docs` 应用构建，页面运行、插件组合、搜索、布局与管理入口都使用本框架和 Vue。VitePress 仅提供构建期 Markdown／语法高亮，不负责启动线上应用。

## 构建与预览

需要 Node 24.14.0、npm 11.9.0 和 Chrome。从仓库根目录执行：

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run build:pages
```

该命令先核对 `apps/docs/kit/provenance.json` 与当前源码输入，再按应用锁安装、同步正文、构建和执行真实 Chrome 验收。静态文件输出到 `apps/docs/output/documentation-site`。完成后在 `apps/docs` 执行 `npm.cmd run preview`，用 Chrome 打开终端给出的回环地址；预览不替换线上 Pages 或已有服务。

默认部署子路径为 `/cordis-web-framework/`。其他路径通过 `DOCS_BASE_PATH` 在构建前指定，需重新验收，不能修改旧产物字符串。站点不需要后台服务、模型或数据库。

## 更新框架冻结包

文档应用只消费 `kit/framework.tgz`，不导入根框架私有源码，也不借用根依赖。更新框架时按以下顺序：

1. 更新根版本、使用文档与 CHANGELOG，执行 `npm.cmd run test:delivery`，取得同一候选的包、模板和真实运行证据。
2. 将该候选的 `framework.tgz` 同步到 `apps/docs/kit`；来源记录包含候选版本、完整性和 `inputs`，不能用未经验收的包配旧记录。
3. 更新文档应用版本和锁文件，使安装包的版本及完整性与候选一致；不自动升级其他依赖。
4. 执行根 `npm.cmd run build:pages`，验证冻结包消费、全部正文和应用交互，再提交并部署。

验收期间不要修改框架源码、构建脚本或使用文档；相关输入改变后重新生成候选，不能手改摘要放行。唯一实施计划不参与框架输入摘要，但应用构建仍记录其正文快照。

## 正文、搜索与导航

正文权威来源是根 `docs`、README、CHANGELOG 和第三方声明。`apps/docs/content` 为同步副本，由 `sync:docs` 生成，不另行手写维护。`docs-site/model.mjs` 复用页面映射；教程源码仅提供阅读下载，真实执行由相应教程验收覆盖。

搜索索引在构建期生成，查询在浏览器内执行，不上传搜索词。目录、复制、搜索、布局、主题和管理页通过公开插件契约组合；插件安装和启用意愿由框架 IndexedDB 安装库保存，不另建页面状态真值。停止搜索插件先取消在途索引请求，再排空命令；布局停用时保留独立管理和恢复入口。

相邻项目的历史引用经[历史来源说明](../records.md#历史来源说明)隔离，不复制外仓源码，也不把不可获取链接伪装成当前使用前提。当前阅读路线不得依赖历史仓库。

## 验收与部署

根 `check:docs` 核对正文链接、锚点和公开 API，`check:reference` 拦截声明漂移。`build:pages` 验证框架驱动应用的全部文档、中文搜索、示例、主题／布局、管理操作、刷新恢复和关闭清理。报告在 `apps/docs/output/full-site-test.json`、`plugin-manager-test.json` 等文件；本地通过不代表已经部署。

`.github/workflows/pages.yml` 在 main 推送后以 Node 24.14.0 构建，只上传静态站，再由 GitHub Pages 部署。每次上线应核对工作流对应提交、站点版本、子路径资源、深链接／刷新、搜索及管理入口，不能仅以 HTTP 200 判定成功。

## 保留的旧文档工具与限制

`docs-site` 中旧 VitePress 独立站及根 `docs:build`／`test:docs` 仍用于历史构建和映射验证，不是当前 Pages 应用的构建入口。不要用其默认主题截图或报告代表当前框架文档应用。

生产目标是现代 Chrome；其他浏览器需单独验收。构建只处理可信本地内容，不运行旧 Vite 开发服务。历史开发依赖告警不能当成已修复，也不能由旧审计结果推断当前安全性；正式维护时应单独审计并评估升级，不用未经验证的 overrides 掩盖风险。静态部署不等于可信插件具备安全沙箱。

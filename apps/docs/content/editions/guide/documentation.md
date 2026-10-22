# 文档站维护

本页描述当前**框架消费文档应用**。框架源码内原 `docs-site` 是早期 VitePress 默认主题站，继续保留其历史和固定交付；它不是当前浏览器应用的启动入口，不把两条构建链混为一谈。

## 构建与预览

在文档消费工程根目录执行（不是框架源码根目录）：

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run build
npm.cmd test
npm.cmd run preview
```

已有常驻预览时不要原地重装其依赖；用 `npm.cmd run check:clean` 在新目录做锁安装、构建和相同测试，避免 Windows 文件占用影响用户入口。

### 产物与路径

| 项目 | 当前值 |
| --- | --- |
| 生产产物 | `output/documentation-site` |
| 默认基础路径 | `/cordis-web-framework/`，仅本地约定，不表示已有同名远端 |
| 预览方式 | esbuild 静态文件服务，随机回环端口，不启动 Vite 开发服务 |
| 浏览器路由 | `#/guide/plugins` 等散列地址，刷新不依赖服务器重写 |

需要其他路径时，构建前设置 `DOCS_BASE_PATH`。只接受字母数字、短横线、下划线组成的路径段；不对旧产物全局替换字符串。打开日志中的实际地址，Ctrl+C 结束该次预览，不覆盖其他实例。

## 内容和导航

### 谁负责什么

| 层 | 责任 |
| --- | --- |
| 当前框架公开包 | 宿主、插件生命周期、界面贡献、命令、导航与主题适配 |
| 文档应用插件 | 页头、侧栏、正文、目录、搜索、主题偏好、复制 |
| 可选默认界面包 | 通用布局及容器主题，文档专用组件作为贡献接入，不改变框架核心 |
| VitePress 1.6.4 | 构建端 Markdown／Shiki 编译，不启动浏览器应用 |
| MiniSearch | 本地全文搜索；索引和查询共用中文分词口径 |
| Vite | 应用 TypeScript／Vue 生产编译 |

不接在线搜索账户，不上传搜索词。目标验收环境为当前现代 Chrome，其他浏览器单独验证。

### 原始快照与编辑稿

`content/source-files.json` 记录从框架同步的文档来源。`content/editions.json` 显式把指定页面替换为 `content/editions/` 编辑稿，保留原页面身份和链接基准。同步不覆盖编辑稿，也不改冻结 kit。

原始内容通过 `npm.cmd run sync:docs -- <源项目根目录>` 更新；普通构建直接用现有快照，不依赖相邻源码或 node_modules。API 签名是生成内容，不手工改写；历史记录不批量改成当前教程。

### 示例与链接

VitePress 官方代码片段引用把已有教程文件展示在正文，展示与可运行文件同源。现有 `.mjs/.html` 同时以 `.txt` 附件提供；页面显示源码不会自动执行 Node 示例。

真实执行由测试负责，新增自包含例子从 Markdown 提取后再运行。代码块有颜色不等于代码正确。

历史 FluidBlock 外仓引用明确跳到[历史来源说明](../records.md#历史来源说明)，不伪装外仓内容已经随站交付。未映射的本地目标或不存在的锚点必须使构建失败，不全局忽略断链。

## 文档检查

| 命令／证据 | 覆盖范围 |
| --- | --- |
| `npm.cmd run build` | 严格类型、插件编译、全部页面和内部链接／锚点、生产产物 |
| `npm.cmd test` | 生产子路径、逐页进入、搜索、复制、主题、深链接、窄屏、关闭清理与文档样例 |
| `npm.cmd run check:clean` | 新目录锁安装、构建与同一套测试，不借相邻依赖 |
| `npm.cmd run check:release` | 冻结 kit 和维护方候选完整性；正式发布条件仍单独判定 |
| `output/full-site-build.json` | 输入与产物摘要 |
| `output/full-site-test.json` | 当前构建的浏览器回归 |
| `output/reading-test.json` | 导航代码样例与阅读布局 |
| `output/default-ui-test.json` | 独立包严格类型／非文档消费、布局替换、主题和双实例清理 |
| `output/plugin-manager-test.json` | 管理页真实启停、依赖联动、布局切换与停用恢复、刷新、窄屏和整体关闭 |
| `output/documented-examples-test.json` | 从正文提取的四个 API 示例、三个同源教程，以及真实 HTTP／Vue 操作和清理 |

修改输入后重新构建，不手改摘要伪装证据有效。文档站源码和输出不是框架运行依赖，不打进冻结 tarball。

维护框架源码内的原始文档或生成签名时，仍遵守源码工程的 `build → docs:reference → check:reference` 和交付门禁；消费应用不接管、绕过或重写这些检查。

## 选型与风险

现有 VitePress 编译适配保持 1.6.4，开发链仍有已知安全告警，框架补丁维护链也需单独评估。可信本地内容、不启动 Vite 服务与独立静态预览降低暴露，但不等于漏洞已修复；正式发布前刷新审计，不用未验证 overrides 或强制升级掩盖风险。

当前未公开部署，GitHub Pages 上线还需确认账号、仓库、许可证和内容范围。只上传静态产物，不公开整个消费工程或 kit。

官方依据：[代码片段引用](https://vuejs.github.io/vitepress/v1/guide/markdown#import-code-snippets)、[Vite 构建 API](https://vite.dev/guide/api-javascript.html#build)、[Pages 静态托管范围](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。

# 测试、构建、部署与升级

## 应用开发者

模板的构建与依赖由应用拥有。browser 的 `npm.cmd run build` 输出 `web/index.html / app.js / app.css / raster-worker.js`；fullstack 额外需要 Node 应用、业务模块和生产依赖，不能把只有页面的 web 目录当成完整服务。

为自己的业务编写规则单元测试、插件装配／清理测试和关键真实流程。服务的 TypeScript 类型不校验外部 JSON，保留运行时校验。测试任务取消要断言迟到结果不覆盖；数据库和下载要回读结果；启动测试不等于功能验收。

静态应用可由任意合适的 HTTP(S) 托管提供，不需要为了纯浏览器应用部署 Node 宿主。保持相对资源路径、JS MIME、Worker 同源与缓存策略；部署到子路径后实际检查导入→处理→下载。框架不提供通用上传或跨源密钥注入。

Node 应用先明确监听地址、配置、秘密来源、TLS／反向代理、就绪与退出预算。默认回环地址和随机端口适合本机，不是生产配置；正式登录和生产仓储必须单独接入。HTTP 处理器停止排空后才关闭数据库。日志输出默认脱敏结构字段，不保证自由文本的秘密自动识别。

## 框架维护者

源码根目录的命令：

| 命令 | 作用与副作用 |
| --- | --- |
| `npm.cmd ci --no-audit --no-fund` | 按锁安装开发依赖；联网，不自动代表安全评估 |
| `npm.cmd run build` | 核对并应用固定 Cordis 补丁，构建 ESM／声明；不启动应用 |
| `npm.cmd test` | 构建、严格类型、Node 契约／HTTP／边界测试；更新 dist |
| `npm.cmd run docs:reference` | 从公开声明生成 API 签名；不改变运行接口 |
| `npm.cmd run check:reference` | 检查签名和公开入口覆盖是否与当前声明一致；先 build |
| `npm.cmd run test:guide` | 以本地包在独立目录核对插件／HTTP 教程和浏览器示例构建／操作；不部署 |
| `npm.cmd run test:browser` | Chrome 宿主验收，随机端口和独立上下文 |
| `npm.cmd run test:records` | 全栈样例 HTTP／Chrome／数据库验证 |
| `npm.cmd run test:ui` | 界面组合、路由、替换与清理验收 |
| `npm.cmd run test:package` | 工程外生产安装、严格类型和同包两应用回读 |
| `npm.cmd run test:delivery` | 上述主要回归与三个可搬移模板交付；输出新候选和报告 |
| `npm.cmd run verify:delivery` | 检查候选与当前输入摘要一致，不重跑行为 |
| `npm.cmd run check:release` | 版本／许可／仓库／日志和当前候选检查，不上传 |
| `npm.cmd run build:pages` | 同仓独立文档应用构建及实际浏览器检查，不部署 |

测试会临时创建回环服务、独立 Chrome、数据目录和消费依赖，需联网和本机 Chrome；不会重用用户页面或正式数据库。源码修改后先 build 再验证产物；只有 typecheck 不能更新 dist。

`build:records`／`example:records` 数据在 `output/records-demo/records.sqlite`；`build:ui`／`example:ui` 在 `output/ui-demo/records.sqlite`；`build:png`／`example:png` 用 `output/png-tool` 静态目录。各自日志给出随机回环地址，不互相替代。不要删用户数据或杀所有 Node 进程释放端口。

## 本地包与文档交付

框架 tarball 附带本手册、API、完整教程文件、更新日志、第三方声明和阶段资料。kit 另带三个模板和实际验收锁；若只收到 tarball，可以建立自己的 package.json，安装该 tgz 及自己直接用到的依赖，但不会自动创建项目目录。

教程用 `node:assert` 自校验的 Node 文件只适合 Node，不打入浏览器；ui 教程使用公开 Vue 适配。API 签名是生成文档，修改源码并重建后重新生成；不要手改签名迎合接口。

## 升级和发布边界

当前没有正式历史版本，不宣称已做 N−1 数据升级。升级前核对公开接口、插件 API、服务和业务磁盘格式；Cordis 还须核对固定补丁是否仍需要。改锁与适配后评审兼容基线，跑契约／包消费／教程及受影响的业务回归，再生成新交付候选。

本版使用 GitHub 预发布附件分发并由 Actions 部署 Pages，暂不上 npm。完整发布步骤、源码与文档应用的边界见根 README 的文档应用小节；历史交付背景见[交付说明](../w6-delivery.md)。Release、Pages、npm 与业务服务部署是不同阶段，分别核验渠道产物。

# 框架驱动的文档应用

这是 cordis-web-framework 的独立消费应用，随同一个仓库交付。构建时使用 VitePress 的 Markdown／高亮能力，浏览器运行时由框架、Vue 与插件组成，不使用 VitePress 应用启动器。

## 构建与验证

从仓库根目录运行 `npm run build:pages`：验证 kit 来源、按本目录锁安装、同步根 docs、构建完整静态站并执行实际 Chrome 检查。输出位于本目录 `output/documentation-site`。Windows 可用 npm.cmd；需要 Node 24.14.0、npm 11.9.0 和 Chrome。

`kit/framework.tgz` 是同版本已验收框架包，`kit/provenance.json` 保存源码输入摘要；应用不导入框架 src/dist 或借用根 node_modules。更新框架后先完成根 test:delivery，再显式更新 kit、来源记录及本应用锁文件。

## 功能与边界

文档、导航、搜索、目录、复制、主题、布局及插件管理由插件组合。管理页区分应用插件与独立插件包，后者直接使用框架公共面板；浏览器导入预构建交付 JSON，不执行 npm 安装。安装／启用意愿保存在浏览器 IndexedDB，单库只允许一个存活管理器；实际运行状态不持久化。

应用仅输出静态文件，适合 GitHub Pages；不需要后台、模型、数据库或服务器秘密。Pages 发布目录不包含源码、安装包或测试控制入口。默认布局／主题位于 packages/default-ui，自有代码采用仓库 MIT，第三方许可见根 THIRD_PARTY_NOTICES.md。

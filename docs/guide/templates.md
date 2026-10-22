# 模板与示例

动态插件生产者模板在 kit/templates/plugin：独立构建 JSON／ESM 包，宿主不重建；使用步骤、共享依赖与管理接口见[插件管理教程](plugin-management.md)。原有 browser／node／fullstack 三种应用模板保留，不因新增插件生产者强制迁移到动态模式。

## 模板不是框架副本

交付 kit 只有一份 `framework.tgz`，三个模板通过 `file:../../framework.tgz` 消费公开包。业务源码可以修改；不要复制框架 `src` 进应用，或用源码 alias 绕过导出。完整搬移 kit 后，在所选模板目录运行命令。

| 模板 | 文件与职责 | 修改入口 |
| --- | --- | --- |
| node | `application.mjs` 装配与启动；`start.mjs` 进程和信号；`package.json`／锁管理依赖 | 增加自己的插件／服务，替换 document、catalog，保留受控退出 |
| browser | `app/domain.ts` 图片规则；`image-session.ts` 任务与真值；`worker-raster.ts` 与 `raster-worker.ts` 平台处理；`application.ts` 装配；组件和 CSS 呈现；`build.mjs` 构建 | 先调整视图，再通过会话添加意图；不让组件直接写别的模块私有状态 |
| fullstack | `app/shared/protocol.ts` 通信契约；`server` 权限与存储；`browser` 编辑会话与组件；根 application/start/build 接线 | 修改业务 schema、服务、仓储和表单；接口变化同步两端校验，不把模型放进框架 |

`package-lock.json` 是该模板验收过的实际安装组合；新增直接使用的依赖应自行显式声明，不依赖框架间接安装碰巧可访问。browser／fullstack 安装 Vue 和构建 esbuild；只用 Node 不安装 Vue／Router。框架单包仍安装 Fastify 等 Node 宿主依赖，但合法浏览器构建不会打入它们。

## 浏览器模板本地预览

在 `templates/browser`：

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run build
npx.cmd --no-install esbuild --servedir=web --serve=127.0.0.1:0
```

打开日志中的随机回环地址。用 Chrome 导入 PNG、设目标宽度、缩放并下载；确认下载尺寸和透明度，而不是只看到按钮变绿。Ctrl+C 退出预览。生产托管只取 `web`，不部署整个模板目录。静态服务来自已安装的 esbuild，[官方 serve 说明](https://esbuild.github.io/api/#serve/)说明它是开发预览能力，不是生产服务选型。

图片样例限制：输入最多 8MiB、单边最多 4096、像素预算 800 万；输出最多 32MiB。只处理 PNG 的静态图像，动画 PNG 不承诺保留动画；文件头预检不等于完整安全扫描。PNG 工具不是框架提供的通用图片核心。

## 全栈模板操作

在 `templates/fullstack` 安装、build、start 后，以 Chrome 打开实际地址。选“编辑者”，读取记录、修改标题并保存，重新读取确认；“只读”角色不能保存。当前数据库为 `data/records.sqlite`，重启后应保留数据；关闭前不要删除或复制正在写入的数据库作迁移。该模板仅绑定本机，实验性 SQLite 和演示凭据不可直接公网使用。

## 扩展练习

1. Node：按[插件教程](plugins.md)添加一个服务与消费者，故意缺失 bindings 观察拒绝，再恢复正确绑定。
2. Browser：按[界面教程](ui.md)在独立教学入口添加位置与命令，点击后停止，验证订阅／贡献和线程没有被全局单例保留。
3. Fullstack：新增业务字段时同时改 schema、服务／存储、草稿和组件，并写非法输入／冲突测试；数据库变更必须有显式版本策略，不自动删库重建。

## 源码版的更多样例

交付 kit 另含两种独立插件模板：`templates/plugin` 为自包含 JSON／ESM 包，`templates/npm-plugin` 为 npm 格式包（Node 多文件＋普通依赖），后者构建时同时输出浏览器交付 JSON。分别使用本目录 README，不把插件模板与三个应用模板混为一类。npm 模板的 check 在宿主启动后才 pack／安装包，验证真实服务消费和卸载，框架来自相同 framework.tgz。

源码根目录可运行 `build:records → example:records`、`build:ui → example:ui`、`build:png → example:png`，具体地址看日志。它们是框架开发样例，不是新应用必须依赖的工程。布局样例 `examples/ui-workspace` 演示路由、主题、两布局和可选扩展撤销；暂不包含在三个起始模板内，不宣称 kit 自带该目录。

源码运行命令、数据位置与测试范围见[交付指南](delivery.md)。不要把示例中的验收控制台当作所有应用都要有的产品界面。

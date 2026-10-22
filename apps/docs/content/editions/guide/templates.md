# 模板与示例

## 模板不是框架副本

kit 只有一份 `framework.tgz`，三个模板通过 `file:../../framework.tgz` 消费公开包。业务源码可以改；不复制框架 `src`、不使用私有源码 alias 绕过导出。完整搬移 kit 后，在选定的模板目录运行命令。

### 是否有默认应用界面

没有统一的默认管理后台。browser 和 fullstack 提供可修改的示例界面，不是框架强制的外观；当前文档站也是一个独立消费应用。布局、页头、侧栏和主题可以作为应用插件开发，框架核心不决定它们长什么样。

### 选择模板

| 模板 | 适合任务 | 主要修改位置 |
| --- | --- | --- |
| `node` | 服务端或无界面程序 | `application.mjs` 装配，`start.mjs` 进程／信号，包清单与锁；替换 document／catalog，保留受控退出 |
| `browser` | 纯浏览器工具 | `app/domain.ts` 图片规则，`image-session.ts` 任务与真值，两个 worker 模块处理位图，`application.ts` 装配，Vue 与 CSS 呈现，`build.mjs` 构建 |
| `fullstack` | 有服务端与持久化的界面应用 | `app/shared/protocol.ts`，服务端权限／仓储，浏览器草稿会话／组件，以及根装配、启动、构建 |

先沿现有职责修改：组件不写别的模块私有状态，协议变化同步两端运行时校验，业务模型不放进框架。

`package-lock.json` 固定已验收安装组合。直接使用的依赖自行显式声明，不能依赖框架间接安装时恰好可访问。browser／fullstack 安装 Vue 与 esbuild，Node 模板不用 Vue／Router。框架单包仍会安装 Node 宿主依赖，但合法浏览器构建不会把它们打入前端。

## 浏览器模板本地预览

在 `templates/browser`：

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run build
npx.cmd --no-install esbuild --servedir=web --serve=127.0.0.1:0
```

### 操作与成功判断

1. Chrome 打开实际随机回环地址。
2. 导入 PNG，设置目标宽度，缩放并下载。
3. 回读下载文件的尺寸和透明度，不只看按钮变绿。
4. Ctrl+C 退出预览。

生产托管只取 `web`，不部署整个工程。esbuild 静态服务用于本地预览，不是生产服务器选型，见[官方说明](https://esbuild.github.io/api/#serve/)。

### 样例限制

| 限制 | 当前值 |
| --- | --- |
| 输入文件 | PNG，最多 8MiB |
| 输入尺寸 | 单边最多 4096，像素预算 800 万 |
| 输出文件 | 最多 32MiB |
| 动画 PNG | 不承诺保留动画 |

文件头预检不等于完整安全扫描。PNG 工具只是业务样例，不是框架通用图像核心。

## 全栈模板操作

在 `templates/fullstack` 安装、构建、启动后，用 Chrome 打开实际地址。

| 步骤 | 验证什么 |
| --- | --- |
| 选择“编辑者” | 读取记录、修改标题并保存 |
| 重新读取 | 确认服务端结果，不以浏览器草稿代替持久化 |
| 选择“只读” | 不能保存 |
| 停止并重启服务 | `data/records.sqlite` 中数据保留 |

不要删除或复制正在写入的数据库做迁移。模板只绑定本机，实验性 SQLite 与演示凭据不能直接公网使用。

## 扩展练习

1. Node：按[插件教程](plugins.md)增加提供者与消费者，缺失 bindings 时明确拒绝，修复后就绪。
2. Browser：按[界面教程](ui.md)运行独立教学入口，操作后停止，确认贡献、订阅和线程没有被全局单例保留。
3. Fullstack：新增字段时一起改 schema、服务、仓储、草稿和组件，补非法输入与冲突测试；数据库采用显式版本策略，不自动删库。

## 源码版的更多样例

| 命令链 | 用途 |
| --- | --- |
| `build:records → example:records` | 记录业务 |
| `build:ui → example:ui` | 路由、主题、两布局和可选扩展撤销 |
| `build:png → example:png` | 图片工具 |

地址看各自日志。`examples/ui-workspace` 是源码工程的布局样例，当前不包含在三个起始模板内，不应宣称 kit 自带它。这些是开发样例，不是新应用必需的相邻依赖。

命令、数据位置与测试范围见[交付指南](delivery.md)。验收控制台不是所有产品都应有的默认界面。

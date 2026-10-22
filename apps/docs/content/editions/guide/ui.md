# 扩展界面、命令与路由

从最小工作台开始，理解“布局声明出口 → 页面插件登记贡献 → 命令统一执行 → 插件释放资源”。前置为[插件教程](plugins.md)，需要 Vue 时显式安装兼容版本，只有路由适配需要 Vue Router，版本见 [API 入口](../reference/index.md)。

## 框架是否提供默认界面

框架提供 `Root`、`Outlet`、界面注册表、命令、导航和主题适配，**不附带默认管理后台或固定应用外壳**。

| 你要做什么 | 当前可用起点 |
| --- | --- |
| 学习界面组合 | 本页“教程工作台”，由布局和页面插件组成 |
| 做浏览器工具 | kit 的 browser 模板，修改应用的 Vue 组件与 CSS |
| 做有服务端的应用 | kit 的 fullstack 模板，保留协议与会话边界 |
| 复用统一外观 | 本地 `@cordis-web/default-ui` 可选包：通用布局和独立主题，不是成套组件库 |

当前文档站的页头、侧栏、搜索和目录也是应用插件，不是安装框架后自动出现的默认页面。

## 使用可选默认布局

文档应用仓库的 `packages/default-ui` 提供独立包，当前私有且未发布。先在该仓库根目录执行 `npm.cmd ci --ignore-scripts` 和 `npm.cmd run build`，再进入 `packages/default-ui` 执行 `npm.cmd pack`；消费方经许可取得 tarball，与框架包及兼容 Vue／Zod 一起安装，不从 npm 同名包猜测下载。

布局负责页头、导航容器、主内容、辅助区及覆盖层；主题只负责指定应用容器的颜色和偏好。搜索、登录、文档目录及业务状态仍属于应用插件。

```ts
import { createDefaultLayoutPlugin, createDefaultThemePlugin, shellPositions } from '@cordis-web/default-ui';
import '@cordis-web/default-ui/style.css';

// 接线片段：uiService、ui、businessViews 和 onError 来自当前应用。
const layout = createDefaultLayoutPlugin({ ui: uiService, outlet: () => presenter.Outlet });
const theme = createDefaultThemePlugin({ target });
const presenter = createVueUi({ registry: ui, views: new Map([...layout.views, ...businessViews]), onError });
// 将两个 plugin 加入装配目录及装配文档，版本读取 plugin.manifest.version。
// 在业务插件内等待 shellPositions.content，再注册自己的页面贡献。
```

布局配置可选 `title`、`home`、`menuLabel`、`navigationLabel`、`asideLabel`、`mainId`、`navigationId`、`variant`（`sidebar`／`topbar`）和 `aside`；主题配置是 `initial`（`light`／`dark`）。默认不读取全局存储，需要保存偏好时显式注入 `storage` 和存储键。

扩展位置为 `ui.shell.header`、`ui.shell.navigation`、`ui.shell.content`、`ui.shell.aside`、`ui.shell.overlays`，均为 `list`／`root`／`1.0.0`；业务若需要路由页面，在自己的内容贡献下声明 `keyed` 子出口。

停用布局先撤销出口，业务服务保留状态；新兼容布局声明同名位置后，通过 `ui.inject` 重新接线。主题停用恢复原容器样式。每个应用创建独立工厂、注册表和唯一 DOM 标识；这不等于提供任意热更新系统。包级 README 给出完整参数和清理责任，文档应用的 `application/start.ts` 是真实接线入口。

### 在文档站体验启停

导航中的“插件管理”进入独立 `#/plugins` 页面，可查看真实状态、依赖和诊断，启停默认主题、文档搜索、页内目录与默认布局，并切换侧栏／顶部布局。主题操作和搜索入口按依赖成组释放；基础服务锁定。即使停止布局，管理页仍提供恢复按钮。

插件启停和布局选择会自动保存到本机，刷新按已保存配置装配；停用项及其依赖组不装载，显示“未启用”。即使默认布局关闭，刷新文档地址也会显示管理恢复入口。配置按浏览器来源和站点基础路径隔离，更换端口／域名或清理站点数据不会继承设置；存储失败会明确提示，坏配置不静默重置。

管理页由当前消费应用开发，不是冻结框架新增的核心 API，也不支持任意插件下载／安装或通用热更新。重复激活会产生新运行身份，列表按当前句柄显示；历史停止实例及诊断保留。

## 先运行一个最小界面

在新 kit 的 browser 模板目录，先完成 `npm.cmd ci --ignore-scripts`，然后复制独立教学入口：

```powershell
Copy-Item ../../docs/examples/ui.mjs ./tutorial.mjs
Copy-Item ../../docs/examples/ui.html ./tutorial.html
npx.cmd --no-install esbuild ./tutorial.mjs --bundle --format=esm --platform=browser --outfile=./tutorial.js --define:__VUE_OPTIONS_API__=true --define:__VUE_PROD_DEVTOOLS__=false --define:__VUE_PROD_HYDRATION_MISMATCH_DETAILS__=false
npx.cmd --no-install esbuild --servedir=. --serve=127.0.0.1:0
```

以 Chrome 打开日志实际地址的 `/tutorial.html`，不要暴露到公网。这个入口不覆盖模板原 PNG 业务。

### 预期结果

| 操作 | 应看到什么 |
| --- | --- |
| 首次进入 | “教程工作台”，命令按钮和“已执行 0 次” |
| 点击“执行命令” | 变为“已执行 1 次” |
| 点击“停止应用” | 应用容器为空，外部状态显示“已停止” |

停止显式等待实际清理，不依赖页面 unload。示例用 Vue `h` 便于直接打包；真实应用可使用 `.vue` 单文件组件。

### 完整源码

<<< @/docs/examples/ui.mjs{js}

[应用源码](../examples/ui.mjs)与 [HTML 入口](../examples/ui.html)均在交付 kit 中，页面展示直接引用同一份文件。

## 位置和贡献如何组成

| 对象 | 在示例中的作用 |
| --- | --- |
| 基础插件 | 创建并提供界面／命令服务，最后关闭注册表 |
| 布局插件 | 在 `root` 登记布局，声明 `tutorial.content` 子出口 |
| 页面插件 | 用 `inject` 等待子出口，再登记页面组件和命令 |
| Vue 呈现层 | 布局把自己的 `uiContext/uiAccess` 传给 `Outlet` |

注册表只内建 `root`。`views` 是应用维护的可信组件 Map，不从清单下载或执行任意代码。`uiAccess` 是所属布局的令牌，不能拿另一个布局的数字或令牌伪造访问权。

### 四种位置

| 类型 | 选择规则 | 适合场景 |
| --- | --- | --- |
| `single` | 整个位置选一个候选；较小优先级优先，同级冲突拒绝 | 整体布局 |
| `list` | 每个 ID 独立竞争，再按 `order` 排序 | 工具项、侧栏区块 |
| `keyed` | 先按 `entryKey` 匹配，再选候选 | 当前页面 |
| `chain` | 同步 `select`，首个非 `null` 命中 | 按输入类型选择呈现器 |

链组件选中后呈现失败只报告局部错误，不重新选下一候选；选择器自身异常会记录并继续。四种位置不是四种简单排列方式。

## 命令与资源归属

按钮统一调用 `commands.execute()`，不复制命令业务。结果为 `completed/disabled/missing/busy/cancelled/failed`，必须区分，不是请求发出就成功。

`run` 获得取消信号。撤销命令后立即禁止新调用并取消在途动作，但返回 Promise 要等实际动作结束。

示例页面插件登记贡献等待撤销和命令撤销；依赖关系决定先停消费者，再停基础服务，视图不跨插件删除 DOM。复杂草稿放在独立业务会话，布局只订阅，不承担业务真值。

## 增加路由与导航

1. 布局声明 `session` 作用域的 `keyed` 出口，例如 `workspace.content`。
2. `createVueNavigation` 使用相同 `target`，明确选择 `hash` 或 `memory`。
3. 登记 `{ id, path, view }` 路由，再登记引用路由的导航项；隐藏路由不一定要菜单。
4. 在 `startVueHost` 的 `configure(app)` 内 `navigation.install(app)`；挂载后等待 `navigation.ready()`。
5. `Outlet` 传入上下文／会话身份、所属 access，并用 `navigation.current()` 作为 `entryKey`。包装组件显式声明 props 或 `inheritAttrs: false`，避免空 attrs 覆盖页面键。
6. 菜单通过 `navigate(routeId)` 跳转，组件观察 `current/list/path/subscribe`。撤销当前路由后显示未找到，不保留旧页面。

插件释放自己的路由、导航和订阅，基础所有者关闭适配。页面退出不等于整个业务会话结束。

可复制的导航数据示例、参数、预期输出和方法表见[导航 API](../reference/ui.md#createvuenavigation)。完整多页面应用还需页面组件与出口，不能把接线片段说成完整工作台。

当前支持静态字面量路径，不承诺参数路由、守卫、SSR 或私有 Router API。更完整的布局样例见[模板和示例](templates.md)。

## 替换布局和主题

新旧布局声明兼容的出口名、版本、种类与作用域。先等待旧布局插件真正 `stopped`，再装载新布局；页面用 `inject` 随声明代际重新登记，已停止等待不能复活。业务会话保留在布局外。

主题通过 `createVueTheme(container).register({ id, tokens })` 设置当前容器的 `--cw-*` 变量，先撤销旧主题再登记新主题。快捷键绑定当前应用容器，输入框默认不触发，只有命令设置 `allowInput` 才允许；不直接绑定全局 document。

精确方法、默认值与诊断见[界面 API](../reference/ui.md)。

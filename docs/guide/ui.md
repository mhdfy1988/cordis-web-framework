# 扩展界面、命令与路由

目标：了解布局如何声明位置、插件如何贡献页面，以及停用时由谁释放资源。前置：读完[插件教程](plugins.md)，需要 Vue 时显式安装兼容的 Vue，只有路由适配需要 Vue Router。版本组合见 [API 入口](../reference/index.md)。

## 先运行一个最小界面

从新 kit 的 browser 模板目录复制文档示例与专用 HTML；这是独立教程入口，不覆盖原 PNG 业务。先执行模板 `npm.cmd ci --ignore-scripts`，再运行：

```powershell
Copy-Item ../../docs/examples/ui.mjs ./tutorial.mjs
Copy-Item ../../docs/examples/ui.html ./tutorial.html
npx.cmd --no-install esbuild ./tutorial.mjs --bundle --format=esm --platform=browser --outfile=./tutorial.js --define:__VUE_OPTIONS_API__=true --define:__VUE_PROD_DEVTOOLS__=false --define:__VUE_PROD_HYDRATION_MISMATCH_DETAILS__=false
npx.cmd --no-install esbuild --servedir=. --serve=127.0.0.1:0
```

最后一条使用模板已经安装的 esbuild 进行本地预览，不安装额外服务器，以 Chrome 打开输出地址的 `/tutorial.html`，不要把它暴露到公网。看到“教程工作台”和按钮，点击“执行命令”后结果变为“已执行 1 次”。页面提供“停止应用”，点击后容器为空、结果为“已停止”；这不是依赖页面卸载事件的异步清理。

本文件为教学布局，使用 Vue `h`，不需要 `.vue` 编译器；实际项目可以选择自己的 SFC 构建链。完整源码见 [ui.mjs](../examples/ui.mjs)。

## 位置和贡献如何组成

例子的框架 UI 注册表只内建 `root`。布局贡献注册到 root，并通过 `children` 声明一个 `tutorial.content` 的 list 出口。页面插件用 `inject` 等待出口存在，再 `registerDynamic` 登记自己的组件。

Vue 布局收到 `uiContext` 和 `uiAccess`，把所属访问令牌传给 `Outlet`，不能拿别人布局的数字伪造访问权。`views` 是应用自己维护的可信组件 Map，不从清单下载或求值任意代码。

| 位置 | 选择方法 | 适合什么 |
| --- | --- | --- |
| single | 整个位置选一个候选；较小 priority 优先，同级冲突 | 整体布局 |
| list | 每个贡献 id 独立竞争，再按 order 排序 | 工具项、侧栏区块 |
| keyed | 先按 entryKey 选择键，再选择候选 | 当前路由页面 |
| chain | 同步 select 按优先级，第一个非 null 命中 | 按输入类型挑选呈现器 |

选择链组件已经选中后渲染失败只显示局部错误，不重新调用下一候选；选择器本身异常则记录并继续。不要以为四种位置只是不同排列。

## 命令与资源归属

教程命令注册到应用自己的 `createCommandRegistry`，按钮统一调用 `execute`，不复制业务规则。命令返回 `completed / disabled / missing / busy / cancelled / failed`，不是无论怎样都算成功。`run` 接收任务信号；命令撤销立即禁止新调用并取消，但返回 Promise 等真实动作结束。

例子的页面插件用 `scope.onDispose` 登记贡献等待撤销和命令撤销；基础插件最后关闭注册表。框架依赖关系决定先退出消费者，视图无需跨插件删除 DOM。业务状态不是例子这种简单计数时，放到独立业务会话，让布局仅订阅，不把草稿塞进布局组件。

## 增加路由与导航

实际多页面应用在 `presentation-vue/routing` 使用 `createVueNavigation`：

1. 布局声明 scope 为 session 的 keyed 页面出口（如 `workspace.content`）。
2. 创建导航适配，明确 history 为 hash 或 memory 和相同 target；注册 `{ id, path, view }` 路由，登记撤销函数。
3. 另行 `registerNavigation({ id, label, routeId, order? })`，菜单只是引用路由，不是注册了路由就必定出现菜单。
4. `startVueHost` 的 `configure(app)` 中调用 `navigation.install(app)`，挂载后 `await navigation.ready()`。
5. 对当前页面用 `Outlet` 传 scope/sessionId、所属 access 和 `entryKey: navigation.current()`；包装组件声明 props 或 `inheritAttrs: false`，避免空属性覆盖页面键。
6. 菜单调用 `navigate(routeId)`，程序以 `current/list/path/subscribe` 观察；撤销当前路由后呈现未找到，不留旧页面；插件释放路由、导航和订阅，基础插件关闭适配。

当前路径只支持字面量静态路径，不承诺参数路由、守卫、SSR 或不受控 Router API。完整运行例是 fullstack 业务上的布局样例，见[模板和示例](templates.md)；本节步骤为接线说明，不能把它单独当成完整可复制应用。

## 替换布局和主题

新旧布局必须声明兼容的出口名、版本、kind 和 scope，先等待旧布局插件真实 `stopped`，再加载新布局；页面用 `inject` 跟随声明代际重新登记，停止等待后不能复活。业务会话保留在布局外。

主题通过 `createVueTheme(target).register({ id, tokens })` 设置当前容器的 `--cw-*` CSS 变量；保存撤销函数再替换。快捷键通过 `bindCommandShortcuts` 绑定当前应用容器，输入框默认不触发，只有命令声明 allowInput 才放行。不要把监听或样式直接写到全局 document 上。

完整方法／默认值／诊断见 [界面 API](../reference/ui.md)。

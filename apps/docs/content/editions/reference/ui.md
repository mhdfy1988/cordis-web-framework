# 界面、命令、导航与主题 API

按需查阅界面注册、组件呈现、命令执行和页面导航。第一次接入请先看[界面教程](../guide/ui.md)；完整类型见[公开签名](signatures.md)。

## 界面类型

### 位置与贡献

| 类型 | 必填字段 | 用途 |
| --- | --- | --- |
| `UiPosition` | `name`、`kind`、`scope`、`version` | 声明组件可以放在哪里 |
| `UiContribution` | `id`、`target`、`range`、`renderer`、`view` | 向一个位置贡献组件 |
| `UiContext` | `scope` | 提供根或会话上下文 |

贡献可选 `key`、`priority`、`order`、`children`、`select`。`priority` 和 `order` 默认 `0`，较小值优先；`children` 声明受控子出口。

`UiContext.scope` 为 `root` 或 `session`。会话出口必须带 `sessionId`；`session-maybe` 同时接受根和会话上下文，根上下文不伪装登录身份。`props` 用于传入页面数据。

`UiPositions` 是可以模块扩充的“位置 → props”静态表，默认只有 `root`。类型化入口 `register`、`resolveUiPosition` 与动态入口执行相同运行时校验；类型声明不等于出口授权。

### 返回句柄与诊断

- `UiHandle`：包含 `instance`、`id`、`dispose()` 和子出口访问令牌 `children`。
- `UiAccess`：注册表核对的所属令牌，不能自行伪造。
- `UiSelection`：选中的贡献、令牌及可选的 `matched` 数据。
- `UiResolution`：包含 `entries`、`kind`、`failed` 和 `failedUnits`。
- `UiSnapshot`：包含版本、位置、贡献／等待／观察计数、关闭状态、清理失败和诊断。

## createUiRegistry 与方法

创建界面贡献注册表。它不操作 DOM，只内建 `root`（`single`／`root`／`1.0.0`）；其他出口由布局贡献声明。

```ts
import { createUiRegistry } from 'cordis-web-framework/ui';

const ui = createUiRegistry();
console.log(ui.inspect());
// 应用真正结束后关闭，不在每次页面切换时关闭。
ui.close();
```

可选参数 `{ onDiagnostic }` 用于外部诊断输出。未配置时仍保存最多 128 条诊断。

### 方法参考

| 方法 | 返回 | 关键约束 |
| --- | --- | --- |
| `register(spec)`／`registerDynamic(spec)` | `UiHandle` | 类型化／动态注册；未声明、版本、作用域或重复声明无效时拒绝；`dispose()` 递归撤销子贡献 |
| `inject(target, install)` | 同步撤销函数 | 等待位置声明；随布局代际重装；`install` 必须返回同步撤销函数 |
| `resolve(target, context, request?)` | `UiResolution` | 根出口以外需要所属 `access`；`keyed` 按 `entryKey` 选择 |
| `resolveUiPosition(ui, target, context, request?)` | 类型化选择结果 | `props` 对应 `UiPositions`，运行时约束不变 |
| `fail(instance, sessionId?)` | 故障标记 | 呈现边界调用；实例不能跨注册表使用 |
| `releaseSession(sessionId)` | 清除故障标记 | 不销毁业务会话数据 |
| `inspect()`／`subscribe(listener)` | 快照／撤销函数 | 不把观察快照复制为第二个可写真值 |
| `close()` | 同步关闭 | 撤销贡献、等待与观察；清理异常保留诊断并抛错，不复用脏注册表 |

### 位置如何选择贡献

| 位置类型 | 选择规则 |
| --- | --- |
| `single` | 整个位置选择一项 |
| `list` | 每个贡献 ID 独立竞争，再按 `order` 排序 |
| `keyed` | 先匹配 `entryKey`，再选择候选 |
| `chain` | 同步调用 `select(props)`，首个非 `null` 命中；`matched` 传给组件 |

`select` 只接只读浅层 props，不能修改业务或返回 Promise。选择器异常会记录并继续；已经选中的链组件呈现失败，不重新选择下一项。其他三类位置可以由已登记的其他候选接替坏候选；同级冲突拒绝，不静默回到旧实现。

`UiError` 携带 `UiDiagnostic`。诊断类型包括 `conflict`、`undeclared`、`incompatible`、`scope`、`unauthorized`、`render-failed`、`selector-failed`、`observer-failed`、`wait-failed`、`cleanup-failed`。作用域、令牌和声明校验与视觉布局是不同责任。

## createVueUi

把注册表贡献呈现为 Vue 组件。输入 `registry`、可信组件表 `views` 和 `onError`，返回 `Root` 与 `Outlet`。

```ts
import { createVueUi } from 'cordis-web-framework/presentation-vue/ui';

// ui 是当前应用的注册表；views 是应用维护的组件 Map。
const presenter = createVueUi({
  registry: ui,
  views,
  onError: detail => console.error('组件呈现失败', detail),
});
```

| 对象 | 用途 |
| --- | --- |
| `Root` | 呈现根出口 |
| `Outlet` | 呈现指定 `target`，必须传入 `context` |
| `VueUiInput` | 描述组件收到的 `uiContext`、`uiAccess` 和 `matched` |

`Outlet` 可选 `access`、`entryKey`、`overlayFallback`（默认 `false`）。普通后备内容仅在出口为空时出现；覆盖模式保留已挂载底图，覆盖生效时隐藏底图而不销毁状态。

> 组件必须明确声明 props／透传边界。`view` 只能来自可信组件表，当前 `renderer` 为 `vue`；未知组件触发局部故障，呈现错误报告位置和贡献标识。Vue 卸载会取消注册表订阅，但应用仍须停止所属插件和宿主。卸载异常不能被呈现边界吞掉。

## createCommandRegistry

统一登记和执行动作。按钮与快捷键调用同一个命令，不各自复制业务逻辑。

```ts
import { createCommandRegistry } from 'cordis-web-framework/commands';

const commands = createCommandRegistry();
const remove = commands.register({
  id: 'example.save',
  label: '保存',
  run(_context, signal) {
    signal.throwIfAborted();
    console.log('保存动作已执行');
  },
});

const result = await commands.execute('example.save', {});
console.log(result); // 检查实际执行状态，不把请求受理当作完成。
await remove();
await commands.close();
```

### 注册与执行

`CommandDefinition` 必填 `id`、`label`、`run`，可选 `enabled` 与 `shortcut`。快捷键 `key` 只接受单字母或数字，`mod`、`shift`、`allowInput` 默认 `false`。重复 ID 或快捷键组合会拒绝。

`run` 接收只读 `CommandContext`（可含 `sessionId`）和取消信号。`execute()` 返回 `completed`、`disabled`、`missing`、`busy`、`cancelled` 或 `failed`；同命令、同会话在途时为 `busy`，不同会话可以独立执行。无效会话 ID 拒绝，不伪造成功。

### 状态与清理

- `list()` 返回定义快照；`enabled(id, context)` 查询是否可执行，条件函数异常会记录并返回 `false`。
- `subscribe(listener)` 返回撤销函数；`inspect()` 给出命令数、在途任务数和失败记录。
- 注册返回的**异步撤销函数**立即禁止新调用并发送取消，等待真实动作结束。
- `close()` 幂等，禁止新动作、取消并等待排空。错误以安全 ID 记录，不暴露原始业务错误；应用可以另行记录安全业务诊断。

## createVueNavigation

连接页面路由与界面注册表。路由负责“当前是谁”，组件由 `createVueUi` 的可信组件表提供；它不会替应用创建页面。

### 创建导航

```ts
import { createVueNavigation } from 'cordis-web-framework/presentation-vue/routing';

const navigation = createVueNavigation({
  ui,                       // 当前应用的界面注册表
  target: 'workspace.pages', // 布局声明的 keyed 出口
  history: 'hash',           // GitHub Pages 等静态托管使用 hash
  onError: () => console.error('页面导航失败'),
});
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `ui` | 是 | 当前应用的 `UiRegistry` |
| `target` | 是 | 已声明或将声明的 `keyed` 出口名 |
| `history` | 是 | `hash` 使用地址散列；`memory` 从 `/` 开始，不改地址栏 |
| `onError` | 是 | 导航失败时的错误回调 |

### 最小示例

在已有 Vue 3 浏览器工程中调用 `await inspectRoutes()`。此例只演示路由数据的注册、跳转与清理，不渲染工作台页面；完整界面接线见[界面教程](../guide/ui.md#增加路由与导航)。

```ts
import { createApp } from 'vue';
import { createUiRegistry } from 'cordis-web-framework/ui';
import { createVueNavigation } from 'cordis-web-framework/presentation-vue/routing';

export async function inspectRoutes() {
  const ui = createUiRegistry();
  const app = createApp({ render: () => null });
  const navigation = createVueNavigation({
    ui, target: 'example.pages', history: 'memory',
    onError: () => console.error('示例导航失败'),
  });
  const removeHome = navigation.register({
    id: 'home', path: '/', view: 'example.home',
  });
  const removeGuide = navigation.register({
    id: 'guide', path: '/guide', view: 'example.guide',
  });
  const removeMenu = navigation.registerNavigation({
    id: 'guide-link', label: '使用指南', routeId: 'guide',
  });

  navigation.install(app); // 必须先安装，再挂载 Vue。
  app.mount(document.createElement('div'));
  try {
    await navigation.ready();
    await navigation.navigate('guide');
    return {
      current: navigation.current(),
      path: navigation.path('guide'),
      menu: navigation.list().map(item => item.label),
    };
  } finally {
    removeMenu();
    removeGuide();
    removeHome();
    navigation.close();
    app.unmount();
    ui.close();
  }
}
```

### 预期结果

```json
{
  "current": "guide",
  "path": "/guide",
  "menu": ["使用指南"]
}
```

这个例子包含两个路由，但只有“使用指南”出现在导航数据中：**注册路由不等于创建菜单项**。真实页面还需要声明出口，并让 `Outlet` 使用 `navigation.current()` 作为 `entryKey`。

### 方法参考

| 方法 | 返回 | 使用时机 |
| --- | --- | --- |
| `install(app)` | `void` | Vue 挂载前调用，只能绑定一个存活的 Vue 应用 |
| `ready()` | `Promise<void>` | 安装后等待初始路由；未安装或已关闭时拒绝 |
| `register(route)` | 同步撤销函数 | 注册静态字面量路径；最多 256 条，重复 ID 或路径拒绝 |
| `registerNavigation(item)` | 同步撤销函数 | 引用已有路由，最多 256 项，`order` 默认 `0` |
| `navigate(id)` | `Promise<void>` | 等待跳转；重复当前地址不算失败，未知目标或其他失败拒绝 |
| `current()` | `string` 或 `undefined` | 读取当前路由 ID；未知地址不沿用旧页面 |
| `list()` | 导航项数组 | 按 `order` 返回导航数据，不是所有路由的列表 |
| `path(id)` | `string` 或 `undefined` | 查询指定路由的路径 |
| `subscribe(listener)` | 同步撤销函数 | 观察路由变化，组件／插件结束时撤销 |
| `inspect()` | 资源计数快照 | 检查路由、导航项、监听数量和关闭状态 |
| `close()` | `void` | 撤销贡献、路由及历史监听，不代替业务会话清理 |

### 注册、观察和撤销

下面是已有 `navigation` 实例上的操作片段。先注册路由，再注册引用它的导航项。

```ts
const removeRoute = navigation.register({
  id: 'settings', path: '/settings', view: 'workspace.settings',
});
const removeMenu = navigation.registerNavigation({
  id: 'settings-link', label: '设置', routeId: 'settings', order: 20,
});
const unsubscribe = navigation.subscribe(() => {
  console.log('当前页面：', navigation.current());
});

await navigation.navigate('settings');
// 当前插件结束时释放自己登记的资源。
unsubscribe();
removeMenu();
removeRoute();
```

> 撤销当前路由会重新匹配地址，并移除相关导航引用。应用应呈现明确的未找到状态，不能继续显示已撤销的旧页面。整体应用结束时，再由所有者调用 `navigation.close()`。

导航适配不暴露 Vue Router 私有对象，不承诺参数路由、路由守卫或其他高级功能。`UiRoute`／`UiNavigation` 是数据契约，不包含 Vue 组件。

## 快捷键与主题

### 快捷键

```ts
import { bindCommandShortcuts } from 'cordis-web-framework/presentation-vue/controls';

// container 是当前应用的 HTMLElement，不绑定全局 document。
const unbind = bindCommandShortcuts(container, commands, () => ({}));
// 应用结束时：
unbind();
```

仅监听指定容器。忽略输入法组合、重复按键、Alt 和已处理事件；输入框默认不执行，命令显式设置 `allowInput` 后才放行。匹配后统一通过命令注册表执行。

### 主题

```ts
import { createVueTheme } from 'cordis-web-framework/presentation-vue/controls';

const theme = createVueTheme(container);
const removeTheme = theme.register({
  id: 'example.light',
  tokens: { '--cw-background': '#ffffff', '--cw-text': '#303038' },
});
removeTheme(); // 先撤销旧主题，再登记新主题。
theme.close();
```

当前只允许一个主题。令牌名限定为 `--cw-*`，值受验证器约束；撤销恢复该容器原值和优先级，`close()` 不改 `documentElement` 或另一应用。主题数据与呈现技术分离，字段见[公开签名](signatures.md)。

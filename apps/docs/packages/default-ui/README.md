# 可选默认界面插件

`@cordis-web/default-ui` 是框架之外的独立消费包，当前为本地私有 `0.0.0`，未发布到 npm。它提供默认布局与深浅主题，不是管理后台或组件库。文档站是第一个真实消费者；非文档工作台验收不引用任何文档业务。

## 边界与入口

- `createDefaultLayoutPlugin({ ui, outlet, id? })` 返回 `{ plugin, views }`。`ui` 是应用自己的界面注册表服务键；`outlet` 延迟返回公开 Vue 呈现器的 `Outlet`。将 `views` 合入应用可信组件表，把 `plugin` 放入装配目录和文档。
- `createDefaultThemePlugin({ target, storage?, storageKey?, onStorageError?, id? })` 返回 `{ plugin, current }`。主题只修改指定容器；可选存储由应用注入。`current()` 在就绪后取得只读 `dark` 和 `toggle()`，未启动／停止后明确拒绝。
- 导出 `shellPositions`、`defaultThemeService` 和对应 TypeScript 类型。应用显式导入 `@cordis-web/default-ui/style.css`；库不自动写入全局样式标签。

继续复用框架公开的 `assembleComposition`／`startVueHost`，不直接使用 Cordis 对象，不新增另一套装配协议。插件清单版本是 `0.0.0`，服务与位置版本是 `1.0.0`；装配项使用实际清单版本，不能全部写成 `1.0.0`。

## 接线示例

以下是放入现有 Vue 宿主的接线片段；完整装配参考本仓 `application/start.ts`，非文档完整用例在 `tests/fixtures/default-ui.ts`。

```ts
import { createDefaultLayoutPlugin, createDefaultThemePlugin, shellPositions } from '@cordis-web/default-ui';
import '@cordis-web/default-ui/style.css';

const layout = createDefaultLayoutPlugin({ ui: uiService, outlet: () => presenter.Outlet });
const theme = createDefaultThemePlugin({ target });
const presenter = createVueUi({ registry: ui, views: new Map([...layout.views, ...businessViews]), onError });
// 装配目录加入 layout.plugin、theme.plugin；uiService 显式绑定到应用基础插件。
// 配置示例：{ title: '我的应用', variant: 'sidebar', aside: true }

// 在业务插件 setup 内接入位置；布局停止时撤销，兼容布局重新声明后自动安装。
scope.onDispose(ui.inject(shellPositions.content, () => {
  const lease = ui.registerDynamic({ id: 'business.main', target: shellPositions.content,
    range: '^1', renderer: 'vue', view: 'business.main' });
  return () => lease.dispose();
}));
```

| 位置 | 归属与用途 |
| --- | --- |
| `ui.shell.header` | 应用操作；布局不内置搜索、登录或主题按钮 |
| `ui.shell.navigation` | 应用导航；布局只负责容器和移动开关 |
| `ui.shell.content` | 业务页面；应用自己声明 keyed／路由子位置 |
| `ui.shell.aside` | 辅助信息，窄屏折叠；`aside: false` 不呈现但仍声明位置 |
| `ui.shell.overlays` | 弹窗等覆盖层，应用负责交互与焦点恢复 |

布局配置均经 Zod 严格校验，未知字段拒绝：`title`、`home`（站内散列／路径）、`menuLabel`、`navigationLabel`、`asideLabel`、`mainId`、`navigationId`、`variant`（`sidebar`／`topbar`）、`aside`。主题配置为 `initial: 'light' | 'dark'`，有效存储偏好优先。

## 生命周期和替换

每个容器、每个运行代际创建新的工厂，不跨应用共享工厂、注册表或主题服务。多个应用同页时给布局指定不同的 `mainId`／`navigationId`；移动抽屉按整页应用设计，不宣称支持并排嵌入式移动工作区。

业务会话独立于布局；停用布局会撤销根贡献和子位置，不销毁业务状态。替换时先真正停完旧布局，再装载声明相同位置／版本的兼容布局；不支持两个根布局同时争抢位置。业务组件本地状态可能随卸载丢失，需保留的数据应在应用会话／服务中。

主题停止会恢复容器原有 CSS 变量及 `data-theme`，旧主题句柄拒绝继续切换；无主题时布局使用自身基础配色。主题不负责停止其他业务插件。应用若要求可选插件在宿主运行时主动停用，应显式配置必需插件名单和自己的控制入口；本包不附带热插件管理器。

## 构建与验证

在仓库根目录执行 `npm.cmd run build`，先构建本包 JS／CSS／类型声明，再构建文档应用；`npm.cmd test` 会打包并在隔离目录安装 tarball，从包的公开入口构建非文档应用，验证双实例、主题清理、布局替换与状态保留。`npm.cmd run check:clean` 从没有产物和依赖的独立目录重复全流程。

依赖仅为现有 Vue／Zod／框架同伴依赖；没有额外图标、组件库、主题或 CSS 运行时。默认布局不是完整可访问性认证、跨浏览器兼容保证或大型设计系统。当前尚未公开发布，许可证与正式版本仍待确定。

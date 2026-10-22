# 界面、命令、导航与主题 API

## PluginPackagePanel

可选入口 `presentation-vue/management`，接收已启动的 `manager: PluginManager`。视图拥有文件草稿、信任确认、忙碌／取消及错误反馈，订阅管理快照；通过 installPackage／enable／disable／uninstall 调用框架，不另存一套安装意愿。文件仅接受浏览器预构建交付 JSON，最大 8 MiB；Node registry 安装通过无界面接口执行，不把纯浏览器面板伪装成 npm 客户端。卸载要求行内确认；停用／失败／等待分别呈现，组件卸载取消在途安装并撤销观察，但不擅自关闭共享管理器。

## 界面类型

UiPosition 是 name/kind/scope/version；UiContribution 必填 id/target/range/renderer/view，选填 key/priority/order/children/select。priority/order 默认为 0，较小值优先，children 声明受控子出口。UiContext 为 scope(root/session)、可选 sessionId 与 props；session 出口必须有会话身份，session-maybe 接受两者，root 不伪装登录上下文。

UiPositions 是应用可模块扩充的静态位置→props 表，默认只有 root。`register` 和 `resolveUiPosition` 提供类型化入口，动态 registerDynamic/resolve 仍执行相同运行时校验；类型声明不提供出口授权。

UiHandle 含 instance/id/dispose 和 children:UiAccess。UiAccess 是注册表内部核对的所属令牌，不能伪造。UiSelection 含贡献、令牌及可选 matched；UiResolution 为 entries、kind、failed 与 failedUnits。UiSnapshot 含版本、位置、贡献／等待／观察计数、关闭／清理失败和诊断。

## createUiRegistry 与方法

可选 `{ onDiagnostic }`，默认无外部诊断输出，仍保留最多 128 条诊断。返回 UiRegistry，不操作 DOM。只内建 root single/root/1.0.0，其他出口由所属贡献声明。

| 方法 | 输入输出 | 语义与清理 |
| --- | --- | --- |
| register(spec) / registerDynamic(spec) | 类型化或动态贡献→UiHandle | 未声明、版本／作用域／重复声明无效则拒绝；dispose 递归撤销子贡献 |
| inject(target,install) | 返回停止等待函数 | 等声明存在安装，可随布局代际重装；install 必须返回同步撤销函数，禁止用异步清理冒充同步完成 |
| resolve(target,context,{access?,entryKey?}?) | UiResolution | root 外要所属 access；keyed 按 entryKey；失败不冒充空白 |
| resolveUiPosition(registry,target,context,request?) | 类型化 resolve | props 对应 UiPositions；其余运行时约束相同 |
| fail(instance,sessionId?) | 标记当前候选在指定会话失败 | 由呈现边界触发，实例不能跨注册表误用 |
| releaseSession(sessionId) | 清理该会话故障标记 | 不销毁应用业务会话数据 |
| inspect / subscribe | 快照／撤销观察函数 | 不在回调里复制一个可写注册表真值 |
| close() | 同步关闭，撤销贡献、等待与观察 | 清理异常保留诊断并抛错，不允许脏注册表复用 |

UiError 含 UiDiagnostic：conflict、undeclared、incompatible、scope、unauthorized、render-failed、selector-failed、observer-failed、wait-failed、cleanup-failed。scope／令牌／声明校验与显示布局是不同责任。

single 对整个位置选一项；list 按每 id 竞争后 order 排序；keyed 先匹配 key；chain 用同步 select(props)，首个非 null 命中，matched 传组件。select 只接只读浅层 props，不能修改业务或返回 Promise。chain 选择器异常记录继续，已选组件失败不重新选择；前三种坏候选可以由已登记的其他候选接替，同级冲突拒绝，不静默回退旧实现。

## createVueUi

必填 `{ registry, views: ReadonlyMap<string,Component>, onError }`，返回 Root 和 Outlet。VueUiInput 描述组件的 uiContext/uiAccess/matched。Root 呈现根出口；Outlet 必填 target/context，选填 access/entryKey/overlayFallback（默认 false）。普通 fallback 仅空时呈现；overlayFallback 保留已挂载底图，选中覆盖时 hidden，不销毁底图状态。

view 必须在可信目录中，renderer 目前为 vue；未知组件触发局部故障。组件应明确声明 props／透传边界。组件呈现故障报告位置和贡献标识；卸载异常不能被边界吞掉，继续交给宿主。Vue 作用域卸载取消注册表订阅；应用仍需停止所属插件和宿主。

## createCommandRegistry

无参数，返回 CommandRegistry。CommandDefinition 必填 id/label/run，选填 enabled 与 shortcut；shortcut 为单字母／数字 key、mod/shift/allowInput（均默认 false）。run 获得只读 CommandContext（可选 sessionId）和 AbortSignal。重复命令 id 或快捷键组合拒绝。

register 返回**异步撤销函数**：立即禁止新调用、发送取消，并等实际在途动作完成。list 返回定义快照，enabled(id,context) 返回当前可用性（条件异常记录并返回 false），execute 返回 completed/disabled/missing/busy/cancelled/failed；同命令同会话运行时 busy，不同会话可独立。无效 sessionId 拒绝，不伪造正常结果。

subscribe 返回撤销函数；inspect 给 commands/running/failures；close 禁止新动作、取消并等待排空，幂等。异常以安全 id 记录，不把原始业务错误暴露；应用按需要另行记录安全业务诊断。

## createVueNavigation

必填 `{ ui, target, history:'hash'|'memory', onError }`，返回 VueNavigation。不内建页面组件；target 应为已声明／将声明的 keyed 位置。

- install(app)：只能绑定一个存活的 Vue 应用，挂载前调用。
- ready()：安装后等待初始路由，memory 从 `/` 开始，未安装或关闭后拒绝。
- register(UiRoute)：id/path/view，静态字面量路径，最多 256 条，重复 id 或 path 拒绝；返回同步撤销，撤销当前路由后重新匹配地址，相关导航引用也移除。
- registerNavigation(UiNavigation)：id/label/routeId、order?=0，先有路由才可引用，最多 256；返回撤销。隐藏路由无需有导航项。
- navigate(id)：等待跳转；重复当前地址不是失败，未知目标或其他失败拒绝。
- current/list/path：当前 id、按 order 的导航项、id 对应路径；未知返回 undefined，不沿用旧页面。
- subscribe：返回撤销函数。inspect：routes/navigation/listeners/closed。close：撤销贡献、路由和历史监听，不替应用关闭业务会话。

不直接提供 Vue Router 私有对象或所有路由高级功能。UiRoute／UiNavigation 是数据契约，不包含 Vue 组件。

## 快捷键与主题

`bindCommandShortcuts(target, commands, context)` 仅在指定 HTMLElement 接键盘，context 函数实时给 CommandContext，返回撤销。忽略输入法组合、重复、Alt、已处理事件；输入框默认不执行，allowInput 才允许，匹配后交统一 execute。退出时撤销监听，不绑定全局 document。

`createVueTheme(target)` 返回 register/close；register(UiTheme) 接 id、tokens，当前仅允许一主题，冲突要求先撤销。token 名为 `--cw-*`，值受验证器限制；返回同步撤销，恢复该容器旧值和优先级。close 恢复当前主题，不改变 documentElement 或另一应用。UiTheme 与呈现技术分离，字段全貌见[签名](signatures.md)。

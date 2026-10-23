import { createApp, defineComponent, h, nextTick, onScopeDispose, onUnmounted, shallowRef, type Component, type PropType } from 'vue';
import { createUiRegistry, type UiContribution, type UiContext } from 'cordis-web-framework/ui';
import { createVueUi } from 'cordis-web-framework/presentation-vue/ui';
import { createCommandRegistry } from 'cordis-web-framework/commands';
import { bindCommandShortcuts, createVueTheme } from 'cordis-web-framework/presentation-vue/controls';
import { createVueNavigation } from 'cordis-web-framework/presentation-vue/routing';
import { startVueHost } from 'cordis-web-framework/presentation-vue';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';

function check(value: unknown, message: string): void { if (!value) throw new Error(message); }
const rootContext: UiContext = { scope: 'root', props: {} };
const contribution = (id: string, target = 'root', extra: Partial<UiContribution> = {}): UiContribution => ({ id, target, range: '^1', renderer: 'vue', view: id, ...extra });

/** 源码构建和 tarball 消费调用相同的黑盒操作，不读取 Vue／注册表内部对象。 */
export async function runUiBrowserContracts() {
  const target = document.createElement('div'); target.className = 'ui-demo'; document.body.append(target);
  const ui = createUiRegistry(); const views = new Map<string, Component>(); const errors: string[] = []; const leaked: unknown[] = [];
  const { Root, Outlet } = createVueUi({ registry: ui, views, onError: detail => { errors.push(detail.contributionId); } });
  let unselectedMounts = 0; let fallbackMounts = 0; let fallbackUnmounts = 0;
  views.set('ok', defineComponent({ setup: () => () => h('p', { 'data-view': 'ok' }, '可用候选') }));
  views.set('bad', defineComponent({ setup() { throw new Error('private-render-error'); } }));
  views.set('unselected', defineComponent({ setup() { unselectedMounts++; return () => h('p', '不该挂载'); } }));
  const Fallback = defineComponent({ setup() { fallbackMounts++; onScopeDispose(() => { fallbackUnmounts++; }); return () => h('p', '覆盖层的底图'); } });
  views.set('layout', defineComponent({ props: ['uiAccess'], setup: props => () => h('section', [
    h(Outlet, { target: 'single', context: rootContext, access: props.uiAccess }),
    h(Outlet, { target: 'list', context: rootContext, access: props.uiAccess }),
    h(Outlet, { target: 'keyed', entryKey: 'current', context: rootContext, access: props.uiAccess }),
    h(Outlet, { target: 'chain', context: rootContext, access: props.uiAccess, overlayFallback: true }, { default: () => h(Fallback) }),
    ...['a', 'b'].map(sessionId => h(Outlet, { target: 'session', context: { scope: 'session', sessionId, props: {} }, access: props.uiAccess })),
  ]) }));
  views.set('session', defineComponent({ props: { uiContext: { type: Object as PropType<UiContext>, required: true } }, setup(props) {
    if (props.uiContext.sessionId === 'a') throw new Error('session-a'); return () => h('p', { 'data-session': props.uiContext.sessionId }, '会话独立');
  } }));
  ui.registerDynamic(contribution('layout', 'root', { children: [
    { name: 'single', kind: 'single', scope: 'root', version: '1.0.0' }, { name: 'list', kind: 'list', scope: 'root', version: '1.0.0' },
    { name: 'keyed', kind: 'keyed', scope: 'root', version: '1.0.0' }, { name: 'chain', kind: 'chain', scope: 'root', version: '1.0.0' },
    { name: 'session', kind: 'single', scope: 'session', version: '1.0.0' },
  ] }));
  ui.registerDynamic(contribution('single.bad', 'single', { view: 'bad' }));
  ui.registerDynamic(contribution('single.ok', 'single', { view: 'ok', priority: 1 }));
  ui.registerDynamic(contribution('list.bad', 'list', { view: 'bad' }));
  ui.registerDynamic(contribution('list.good', 'list', { view: 'ok' }));
  ui.registerDynamic(contribution('key.ok', 'keyed', { key: 'current', view: 'ok' }));
  ui.registerDynamic(contribution('session.editor', 'session', { view: 'session' }));
  const app = createApp(Root); app.config.errorHandler = error => { leaked.push(error); };
  try {
    app.mount(target); await nextTick(); await nextTick();
    check(target.querySelector('[data-ui-outlet="single"] [data-view="ok"]'), '单项故障后应选择已登记的有效候选');
    check(target.querySelector('[data-ui-outlet="list"] [data-ui-error="list.bad"]'), '列表失败单元必须呈现错误');
    check(target.querySelector('[data-ui-outlet="list"] [data-view="ok"]'), '列表其他项不得消失');
    check(target.querySelector('[data-ui-outlet="keyed"] [data-view="ok"]'), '键控出口应选中当前键');
    check(target.querySelector('[data-session="b"]'), '会话 A 的故障不得影响会话 B');
    check(fallbackMounts === 1 && fallbackUnmounts === 0, '自然空时覆盖底图应已挂载');
    ui.registerDynamic(contribution('selector.throw', 'chain', { view: 'unselected', select() { throw new Error('selector'); } }));
    ui.registerDynamic(contribution('selector.null', 'chain', { view: 'unselected', select: () => null }));
    const selected = ui.registerDynamic(contribution('selector.match', 'chain', { view: 'bad', select: () => ({ match: true }) }));
    ui.registerDynamic(contribution('selector.later', 'chain', { view: 'unselected', select: () => true }));
    await nextTick(); await nextTick();
    check(target.querySelector('[data-ui-outlet="chain"] [data-ui-error="selector.match"]'), '选择链组件失败只显示局部边界');
    check(unselectedMounts === 0, '选择链不得挂载未选组件或把组件故障当作改选条件');
    check(fallbackMounts === 1 && fallbackUnmounts === 0, '覆盖底图隐藏时不得卸载');
    check(target.querySelector<HTMLElement>('[data-ui-overlay-fallback="chain"]')?.hidden, '有选中结果时底图应隐藏');
    selected.dispose(); await nextTick(); check(unselectedMounts === 1, '显式撤销选中候选后才可改选下一候选');
    check(errors.includes('single.bad') && errors.includes('list.bad') && errors.includes('session.editor') && errors.includes('selector.match'), '呈现故障必须可观测');
    check(leaked.length === 0, '已隔离的呈现故障不得逃到应用错误处理器');
  } finally { app.unmount(); ui.close(); target.remove(); }
  check(ui.inspect().observers === 0 && ui.inspect().contributions === 0 && fallbackUnmounts === 1, '卸载必须清除订阅和节点');

  // 同一出口切换上下文时，选择链的局部故障边界也不能把默认上下文与 @root 混为一谈。
  const mixed = createUiRegistry(); const mixedTarget = document.createElement('div'); document.body.append(mixedTarget);
  const mixedContext = shallowRef<UiContext>(rootContext);
  const mixedViews = new Map<string, Component>();
  const mixedUi = createVueUi({ registry: mixed, views: mixedViews, onError() {} });
  mixedViews.set('layout', defineComponent({ props: ['uiAccess'], setup: props => () => h(mixedUi.Outlet,
    { target: 'mixed', context: mixedContext.value, access: props.uiAccess }) }));
  mixedViews.set('mixed', defineComponent({ props: ['uiContext'], setup(props) {
    if (props.uiContext.scope === 'root') throw new Error('root-only-fault');
    return () => h('p', { 'data-mixed-session': props.uiContext.sessionId }, '命名会话正常');
  } }));
  mixed.registerDynamic(contribution('layout', 'root', { children: [{ name: 'mixed', kind: 'chain', scope: 'session-maybe', version: '1.0.0' }] }));
  mixed.registerDynamic(contribution('mixed', 'mixed', { select: () => true }));
  const mixedApp = createApp(mixedUi.Root);
  try {
    mixedApp.mount(mixedTarget); await nextTick(); await nextTick();
    check(mixedTarget.querySelector('[data-ui-error="mixed"]'), '默认上下文应呈现局部故障');
    mixedContext.value = { scope: 'session', sessionId: '@root', props: {} }; await nextTick(); await nextTick();
    check(mixedTarget.querySelector('[data-mixed-session="@root"]'), '命名会话不能复用默认上下文的故障边界');
    mixedContext.value = rootContext; await nextTick(); await nextTick();
    check(mixedTarget.querySelector('[data-ui-error="mixed"]'), '切回默认上下文不能复用命名会话的健康组件');
  } finally { mixedApp.unmount(); mixed.close(); mixedTarget.remove(); }

  const container = document.createElement('div'); const input = document.createElement('input'); container.append(input); document.body.append(container);
  const commands = createCommandRegistry(); let invoked = 0;
  commands.register({ id: 'save', label: '保存', shortcut: { key: 's', mod: true, allowInput: true }, run() { invoked++; } });
  commands.register({ id: 'plain', label: '普通键', shortcut: { key: 'h' }, run() { invoked += 100; } });
  const stopShortcuts = bindCommandShortcuts(container, commands, () => ({ sessionId: 'one' }));
  try {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })); await nextTick(); await Promise.resolve();
    check(invoked === 1, '输入框显式允许的保存快捷键必须调用命令');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true })); await Promise.resolve(); check(invoked === 1, '普通快捷键不能抢输入');
    stopShortcuts(); input.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true })); await Promise.resolve(); check(invoked === 1, '撤销后快捷键不得触发');
    container.style.setProperty('--cw-accent', 'red', 'important'); const theme = createVueTheme(container);
    const removeTheme = theme.register({ id: 'blue', tokens: { '--cw-accent': 'blue' } });
    let conflict = false; try { theme.register({ id: 'other', tokens: {} }); } catch { conflict = true; }
    check(conflict && container.style.getPropertyValue('--cw-accent') === 'blue', '主题冲突必须拒绝');
    removeTheme(); check(container.style.getPropertyValue('--cw-accent') === 'red' && container.style.getPropertyPriority('--cw-accent') === 'important', '主题撤销应恢复原属性和优先级');
    theme.close();
  } finally { stopShortcuts(); await commands.close(); container.remove(); }

  const navUi = createUiRegistry(); const navigation = createVueNavigation({ ui: navUi, target: 'pages', history: 'memory', onError() { throw new Error('unexpected navigation'); } });
  const element = document.createElement('div'); document.body.append(element); const navApp = createApp({ render: () => null });
  try {
    const remove = navigation.register({ id: 'a', path: '/', view: 'ok' }); navigation.registerNavigation({ id: 'a', label: '页面 A', routeId: 'a' });
    let rejected = 0;
    for (const route of [{ id: 'a', path: '/another', view: 'ok' }, { id: 'b', path: '/', view: 'ok' }]) try { navigation.register(route); } catch { rejected++; }
    check(rejected === 2 && navigation.inspect().routes === 1, '路由同名同路径应拒绝而非 Vue Router 静默覆盖');
    navigation.install(navApp); navApp.mount(element); await navigation.ready(); check(navigation.current() === 'a', '内存历史初始化应匹配路由');
    remove(); await nextTick(); await new Promise(resolve => setTimeout(resolve, 20));
    check(!navigation.current() && navigation.list().length === 0 && navUi.inspect().waiters === 0, '移除当前路由必须进入未找到且清除导航和等待');
  } finally { navApp.unmount(); navigation.close(); navUi.close(); element.remove(); }
  check(navigation.inspect().listeners === 0 && navigation.inspect().routes === 0, '导航退出必须释放资源');
  const brokenTarget = document.createElement('div'); document.body.append(brokenTarget);
  const brokenUi = createUiRegistry(); let hiddenCleanupFailure = 0;
  const Broken = defineComponent({ setup() { onUnmounted(() => { throw new Error('unmount-failure'); }); return () => h('p', '测试卸载故障'); } });
  const brokenPresenter = createVueUi({ registry: brokenUi, views: new Map([['broken', Broken]]), onError() { hiddenCleanupFailure++; } });
  brokenUi.registerDynamic(contribution('broken'));
  try {
    const host = await startVueHost({ target: brokenTarget, component: brokenPresenter.Root, onError() {},
      createRuntime: createCordisRuntime, document: { formatVersion: 1, plugins: [], bindings: {} }, catalog: new Map() });
    const result = await host.stop();
    check(result.state === 'cleanup-failed' && hiddenCleanupFailure === 0, '生产模式的 Vue 卸载异常必须交给宿主，不能吞成候选呈现成功');
    let refused = false;
    try { await startVueHost({ target: brokenTarget, component: { render: () => null }, onError() {}, createRuntime: createCordisRuntime,
      document: { formatVersion: 1, plugins: [], bindings: {} }, catalog: new Map() }); } catch { refused = true; }
    check(refused, '清理失败的宿主容器不得复用');
  } finally { brokenUi.close(); brokenTarget.remove(); }
  return { rendering: true, allFourKinds: true, scopes: true, overlayLifecycle: true, errors: errors.length, shortcuts: true, themes: true, navigation: true, cleanupFailureObservable: true };
}

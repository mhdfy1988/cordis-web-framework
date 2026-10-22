import { computed, defineComponent, h, onErrorCaptured, onScopeDispose, ref, shallowRef, type Component, type PropType } from 'vue';
import type { UiAccess, UiContext, UiRegistry, UiSelection } from '../contracts/ui.ts';

export interface VueUiInput { readonly uiContext: UiContext; readonly uiAccess: UiAccess; readonly matched?: unknown }

/** 目录只映射可信组件，不从插件清单下载／求值代码。工厂状态属于单个应用。 */
export function createVueUi(options: {
  readonly registry: UiRegistry;
  readonly views: ReadonlyMap<string, Component>;
  readonly onError: (detail: { readonly target: string; readonly contributionId: string }) => void;
}) {
  const registry = options.registry;
  const report = (target: string, contributionId: string) => { try { options.onError({ target, contributionId }); } catch { /* 不让输出破坏边界。 */ } };
  const View = defineComponent({
    name: 'FrameworkUiView',
    props: { selection: { type: Object as PropType<UiSelection>, required: true }, context: { type: Object as PropType<UiContext>, required: true } },
    setup(props) { return () => {
      const { contribution, children, matched } = props.selection;
      const component = options.views.get(contribution.view);
      if (contribution.renderer !== 'vue' || !component) throw new Error('界面贡献的呈现器或组件不存在');
      return h(component, { uiContext: props.context, uiAccess: children, matched });
    }; },
  });
  const Boundary = defineComponent({
    name: 'FrameworkUiBoundary',
    props: { selection: { type: Object as PropType<UiSelection>, required: true }, context: { type: Object as PropType<UiContext>, required: true }, chain: Boolean },
    setup(props) {
      const failed = ref(false);
      onErrorCaptured((_error, _instance, info) => {
        // 卸载异常属于真实资源清理故障，必须继续交给宿主，而不是吞成呈现成功。
        if (/unmount/i.test(info) || /#runtime-(bum|um|16)$/.test(info)) return;
        failed.value = true; report(props.selection.contribution.target, props.selection.contribution.id);
        if (!props.chain) registry.fail(props.selection.instance, props.context.sessionId);
        return false;
      });
      return () => failed.value ? h('div', { role: 'alert', 'data-ui-error': props.selection.contribution.id }, '界面扩展暂不可用')
        : h(View, { selection: props.selection, context: props.context });
    },
  });
  const Outlet = defineComponent({
    name: 'FrameworkUiOutlet',
    props: { target: { type: String, required: true }, context: { type: Object as PropType<UiContext>, required: true },
      access: Object as PropType<UiAccess>, entryKey: String, overlayFallback: Boolean },
    setup(props, { slots }) {
      const version = shallowRef(registry.inspect().version);
      onScopeDispose(registry.subscribe(() => { version.value = registry.inspect().version; }));
      const resolution = computed(() => { version.value; return registry.resolve(props.target, props.context, { access: props.access, entryKey: props.entryKey }); });
      return () => {
        const result = resolution.value;
        const selected = result.entries.map(selection => h(Boundary, { key: `${selection.instance}:${props.context.sessionId ?? '@root'}`,
          selection, context: props.context, chain: result.kind === 'chain' }));
        const errors = result.failedUnits.map(unit => h('div', { key: `error:${unit}`, role: 'alert', 'data-ui-error': unit || props.target }, '界面扩展暂不可用'));
        const hasSelection = selected.length > 0 || errors.length > 0;
        const fallback = props.overlayFallback
          ? h('div', { key: 'overlay-fallback', hidden: hasSelection, 'data-ui-overlay-fallback': props.target }, slots.default?.())
          : !hasSelection ? slots.default?.() : undefined;
        return h('div', { 'data-ui-outlet': props.target }, [...selected, ...errors, fallback]);
      };
    },
  });
  const Root = defineComponent({ name: 'FrameworkUiRoot', setup: () => () => h(Outlet, { target: 'root', context: { scope: 'root', props: {} } }) });
  return Object.freeze({ Root, Outlet });
}

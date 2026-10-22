import { defineComponent, h, shallowRef } from 'vue';
import type { Component, PropType } from 'vue';
import { definePlugin } from 'cordis-web-framework/composition';
import type { ServiceKey } from 'cordis-web-framework';
import type { UiRegistry } from 'cordis-web-framework/ui';
import type { UiAccess, UiContext } from 'cordis-web-framework/contracts/ui';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { z } from 'zod';
import DefaultShell from './DefaultShell.vue';
import { shellPositions } from './contracts.js';

const text = z.string().trim().min(1).max(120);
const safeHome = z.string().refine(value => value.startsWith('#/') || /^\/(?!\/)/.test(value), '首页必须为站内地址');
const schema = z.strictObject({
  title: text.default('应用'), home: safeHome.default('#/'), menuLabel: text.default('菜单'), navigationLabel: text.default('导航'), asideLabel: text.default('辅助信息'),
  mainId: z.string().regex(/^[a-z][\w-]*$/).default('application-content'), navigationId: z.string().regex(/^[a-z][\w-]*$/).default('application-navigation'),
  variant: z.enum(['sidebar', 'topbar']).default('sidebar'), aside: z.boolean().default(true),
}).prefault({});

export function createDefaultLayoutPlugin(input: { ui: ServiceKey<UiRegistry>; outlet: () => Component; id?: string }) {
  const id = input.id ?? 'ui.default-layout';
  const options = shallowRef<z.output<typeof schema>>();
  const viewName = id + '.view';
  const View = defineComponent({ inheritAttrs: false, props: {
    uiContext: { type: Object as PropType<UiContext>, required: true }, uiAccess: { type: Object as PropType<UiAccess>, required: true },
  }, setup: props => () => options.value ? h(DefaultShell, { options: options.value, outlet: input.outlet(), uiContext: props.uiContext, uiAccess: props.uiAccess }) : null });
  const plugin = definePlugin({ manifest: { id, version: '0.0.0', apiVersion: '^1', requires: [{ id: input.ui.id, range: '^1' }], provides: [] },
    config: zodConfig(schema), setup(scope, config) {
      if (options.value) throw new Error('布局工厂已被使用；每个应用实例须创建独立工厂');
      options.value = config;
      scope.onDispose(() => { options.value = undefined; });
      const lease = scope.get(input.ui).register({ id, target: 'root', range: '^1', renderer: 'vue', view: viewName,
        children: Object.values(shellPositions).map(name => ({ name, kind: 'list' as const, scope: 'root' as const, version: '1.0.0' })) });
      scope.onDispose(() => lease.dispose());
    } });
  return Object.freeze({ plugin, views: new Map<string, Component>([[viewName, View]]) });
}

import type { InjectionKey } from 'vue';
import type { PluginController } from './controller.ts';
export const pluginControllerKey: InjectionKey<PluginController> = Symbol('plugin-controller');

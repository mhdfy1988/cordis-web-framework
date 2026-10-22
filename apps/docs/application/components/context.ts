import { inject } from 'vue';
import type { InjectionKey, Component } from 'vue';
export const outletKey: InjectionKey<Component> = Symbol('framework-outlet');
export const stopKey: InjectionKey<() => Promise<void>> = Symbol('stop-application');
export function required<T>(key: InjectionKey<T>): T { const value = inject(key); if (value === undefined) throw new Error('文档组件服务未装配'); return value; }

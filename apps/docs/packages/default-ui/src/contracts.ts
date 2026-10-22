import { service } from 'cordis-web-framework';
import type { Ref } from 'vue';

export const shellPositions = Object.freeze({ header: 'ui.shell.header', navigation: 'ui.shell.navigation', content: 'ui.shell.content', aside: 'ui.shell.aside', overlays: 'ui.shell.overlays' });
export interface DefaultTheme {
  readonly dark: Readonly<Ref<boolean>>;
  toggle(): void;
}
export const defaultThemeService = service<DefaultTheme>('ui.default-theme');
export interface ThemeStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface ShellOptions {
  readonly title: string; readonly home: string; readonly menuLabel: string;
  readonly navigationLabel: string; readonly asideLabel: string;
  readonly mainId: string; readonly navigationId: string;
  readonly variant: 'sidebar' | 'topbar'; readonly aside: boolean;
}

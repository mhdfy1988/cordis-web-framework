import { readonly, ref } from 'vue';
import { definePlugin } from 'cordis-web-framework/composition';
import { createVueTheme } from 'cordis-web-framework/presentation-vue/controls';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { z } from 'zod';
import { defaultThemeService } from './contracts.js';
import type { DefaultTheme, ThemeStorage } from './contracts.js';

const palettes = {
  light: { '--cw-background': '#ffffff', '--cw-panel': '#f6f6f7', '--cw-text': '#303038', '--cw-muted': '#67676d', '--cw-border': '#e2e2e5', '--cw-accent': '#3451b2' },
  dark: { '--cw-background': '#1b1b1f', '--cw-panel': '#161618', '--cw-text': '#e5e5e8', '--cw-muted': '#aaaab2', '--cw-border': '#333338', '--cw-accent': '#a8b1ff' },
};
export function createDefaultThemePlugin(input: { target: HTMLElement; storage?: ThemeStorage; storageKey?: string; onStorageError?: (error: unknown) => void; id?: string }) {
  const id = input.id ?? 'ui.default-theme'; const key = input.storageKey ?? 'default-ui.theme';
  let active: DefaultTheme | undefined;
  const plugin = definePlugin({ manifest: { id, version: '0.0.0', apiVersion: '^1', requires: [], provides: [{ id: defaultThemeService.id, version: '1.0.0' }] },
    config: zodConfig(z.strictObject({ initial: z.enum(['light', 'dark']).default('light') }).prefault({})),
    setup(scope, config) {
      if (active) throw new Error('主题工厂已被使用；每个应用实例须创建独立工厂');
      const dark = ref(config.initial === 'dark');
      try { const saved = input.storage?.getItem(key); if (saved === 'light' || saved === 'dark') dark.value = saved === 'dark'; }
      catch (error) { input.onStorageError?.(error); }
      const theme = createVueTheme(input.target); const previous = input.target.getAttribute('data-theme');
      let remove: (() => void) | undefined; let closed = false;
      scope.onDispose(() => {
        closed = true; remove?.(); theme.close(); active = undefined;
        if (previous === null) input.target.removeAttribute('data-theme'); else input.target.setAttribute('data-theme', previous);
      });
      function apply() { remove?.(); remove = theme.register({ id, tokens: palettes[dark.value ? 'dark' : 'light'] }); input.target.dataset.theme = dark.value ? 'dark' : 'light'; }
      apply();
      active = Object.freeze({ dark: readonly(dark), toggle() {
        if (closed) throw new Error('主题插件已停止');
        dark.value = !dark.value; apply();
        try { input.storage?.setItem(key, dark.value ? 'dark' : 'light'); } catch (error) { input.onStorageError?.(error); }
      } });
      scope.provide(defaultThemeService, active);
    } });
  return Object.freeze({ plugin, current() { if (!active) throw new Error('主题插件尚未就绪或已停止'); return active; } });
}

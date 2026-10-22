import { createApp, type App, type Component } from 'vue';
import { startBrowserHost, type BrowserHostOptions } from '../hosts/browser/index.ts';
import type { HostRuntimeView } from '../contracts/host.ts';

/** Vue 是可选呈现适配；公共核心不接收 Vue 类型。 */
export function startVueHost(options: Omit<BrowserHostOptions, 'mount'> & {
  readonly component: Component;
  readonly props?: (runtime: HostRuntimeView) => Record<string, unknown>;
  readonly configure?: (app: App) => void;
  readonly onError: (error: unknown) => void;
}) {
  return startBrowserHost({ ...options, mount(target, runtime, onRelease) {
    const app = createApp(options.component, options.props?.(runtime));
    let mounting = true;
    let mountFailed = false;
    let mountError: unknown;
    let unmounting = false;
    let unmountFailed = false;
    let unmountError: unknown;
    app.config.errorHandler = error => {
      if (mounting) { mountFailed = true; mountError = error; }
      else if (unmounting) { unmountFailed = true; unmountError = error; }
      else options.onError(error);
    };
    onRelease(() => {
      unmounting = true;
      app.unmount();
      if (unmountFailed) throw new Error('Vue 卸载失败', { cause: unmountError });
    });
    options.configure?.(app);
    app.mount(target);
    mounting = false;
    if (mountFailed) throw new Error('Vue 初始呈现失败', { cause: mountError });
  } });
}

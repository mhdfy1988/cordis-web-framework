import type { Cleanup } from '../../contracts/runtime.ts';
import type { HostHandle, HostOptions, HostRuntimeView } from '../../contracts/host.ts';
import { openHost } from '../shared/lifecycle.ts';
export { HostStartError } from '../shared/lifecycle.ts';
export type { HostHandle, HostOptions, HostSnapshot, HostRuntimeView } from '../../contracts/host.ts';

const occupied = new WeakSet<Element>();
export interface BrowserHostOptions extends HostOptions {
  readonly target: Element;
  readonly mount: (target: Element, runtime: HostRuntimeView, onRelease: (cleanup: Cleanup) => void) => void | Promise<void>;
}

export async function startBrowserHost(options: BrowserHostOptions): Promise<HostHandle> {
  const target = options.target;
  if (typeof document === 'undefined' || !(target instanceof Element) || !target.isConnected
    || target.childNodes.length || occupied.has(target)) throw new Error('浏览器宿主需要已连接、空闲的独立容器');
  occupied.add(target);
  const capabilities = ['dom'];
  if (typeof globalThis.fetch === 'function') capabilities.push('fetch');
  if (globalThis.crypto?.subtle) capabilities.push('crypto');
  let acquired = false;
  let released = false;
  try {
    return await openHost(options, { platform: 'browser', capabilities }, async context => {
      acquired = true;
      let unmount: Cleanup | undefined;
      context.onRelease(async () => {
        await unmount?.(); target.replaceChildren(); occupied.delete(target); released = true;
      });
      await options.mount(target, context.runtime, cleanup => {
        if (unmount) throw new Error('呈现清理只能登记一次');
        unmount = cleanup;
      });
    });
  } catch (error) {
    // 清理失败的容器保持占用，不能把残留实例当成可重新挂载。
    if (!acquired || released) occupied.delete(target);
    throw error;
  }
}

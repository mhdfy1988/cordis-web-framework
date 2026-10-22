import type { CommandContext, CommandRegistry } from '../contracts/commands.ts';
import type { UiTheme } from '../contracts/navigation.ts';
import { uiThemeValidator } from '../validation-zod/index.ts';

/** 只监听所属应用容器；不抢占另一实例、输入法组合或系统快捷键。 */
export function bindCommandShortcuts(target: HTMLElement, commands: CommandRegistry, context: () => CommandContext): () => void {
  const listener = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey) return;
    const editable = event.target instanceof Element && !!event.target.closest('input,textarea,select,[contenteditable="true"]');
    for (const command of commands.list()) {
      const shortcut = command.shortcut;
      if (!shortcut || shortcut.key !== event.key.toLowerCase() || !!shortcut.mod !== (event.ctrlKey || event.metaKey)
        || !!shortcut.shift !== event.shiftKey || editable && !shortcut.allowInput || !commands.enabled(command.id, context())) continue;
      event.preventDefault(); void commands.execute(command.id, context()); return;
    }
  };
  target.addEventListener('keydown', listener); return () => target.removeEventListener('keydown', listener);
}

/** 主题仅拥有当前容器的变量；显式撤销恢复原值，不污染 documentElement 或其他实例。 */
export function createVueTheme(target: HTMLElement) {
  let active: (() => void) | undefined;
  return Object.freeze({
    register(input: UiTheme) {
      if (active) throw new Error('主题冲突：请先撤销当前主题');
      const parsed = uiThemeValidator.validate(input); if (!parsed.ok) throw new TypeError('主题定义无效');
      const previous = new Map<string, { value: string; priority: string }>();
      for (const [name, value] of Object.entries(parsed.value.tokens)) {
        previous.set(name, { value: target.style.getPropertyValue(name), priority: target.style.getPropertyPriority(name) });
        target.style.setProperty(name, value);
      }
      const dispose = () => {
        if (active !== dispose) return;
        active = undefined;
        for (const [name, old] of previous) { if (old.value) target.style.setProperty(name, old.value, old.priority); else target.style.removeProperty(name); }
      };
      active = dispose; return dispose;
    },
    close() { active?.(); },
  });
}

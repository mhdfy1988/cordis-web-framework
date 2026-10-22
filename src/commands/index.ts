import type { CommandContext, CommandDefinition, CommandRegistry, CommandResult } from '../contracts/commands.ts';
export type * from '../contracts/commands.ts';

/** 按钮、菜单与快捷键只适配这一入口；命令的业务动作仍由所属插件提供。 */
export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<string, CommandDefinition>();
  const running = new Map<CommandDefinition, Map<string, { controller: AbortController; done: Promise<CommandResult> }>>();
  const listeners = new Set<() => void>(); const failures: string[] = [];
  let closed = false; let closing: Promise<void> | undefined;
  const failed = (id: string) => { if (failures.length >= 128) failures.shift(); failures.push(id); };
  const notify = () => { for (const listener of [...listeners]) try { listener(); } catch { failed('observer'); } };
  function enabled(id: string, context: CommandContext) {
    const command = commands.get(id); if (!command || closed) return false;
    try { return command.enabled?.(Object.freeze({ ...context })) ?? true; } catch { failed(id); return false; }
  }
  return Object.freeze({
    register(input: CommandDefinition) {
      if (closed) throw new Error('命令注册表已关闭');
      if (!/^[\w.-]{1,128}$/.test(input.id) || !input.label?.trim() || input.label.length > 128
        || typeof input.run !== 'function' || input.enabled !== undefined && typeof input.enabled !== 'function') throw new TypeError('命令定义无效');
      const shortcut = input.shortcut && Object.freeze({ ...input.shortcut, key: input.shortcut.key.toLowerCase() });
      if (shortcut && !/^[a-z0-9]$/.test(shortcut.key)) throw new TypeError('快捷键只接受单个字母或数字');
      if (commands.has(input.id)) throw new Error(`命令冲突：${input.id}`);
      if (shortcut && [...commands.values()].some(value => value.shortcut && value.shortcut.key === shortcut.key
        && !!value.shortcut.mod === !!shortcut.mod && !!value.shortcut.shift === !!shortcut.shift)) throw new Error('快捷键冲突');
      const command = Object.freeze({ ...input, shortcut }); commands.set(command.id, command); notify();
      let removing: Promise<void> | undefined;
      return () => {
        if (removing) return removing;
        const done = Promise.withResolvers<void>(); removing = done.promise;
        if (commands.get(command.id) === command) commands.delete(command.id);
        const tasks = [...running.get(command)?.values() ?? []];
        for (const task of tasks) task.controller.abort();
        notify();
        void Promise.all(tasks.map(task => task.done)).then(() => done.resolve(), done.reject); return removing;
      };
    },
    list: () => Object.freeze([...commands.values()]), enabled,
    async execute(id: string, context: CommandContext): Promise<CommandResult> {
      if (closed || !commands.has(id)) return 'missing';
      if (context.sessionId !== undefined && (!context.sessionId || context.sessionId.length > 128)) throw new TypeError('命令会话无效');
      const command = commands.get(id)!; const key = context.sessionId ?? '@root';
      if (running.get(command)?.has(key)) return 'busy';
      if (!enabled(id, context)) return 'disabled';
      if (commands.get(id) !== command || closed) return 'missing';
      const controller = new AbortController();
      const tasks = running.get(command) ?? new Map(); running.set(command, tasks);
      // 先登记再执行，允许同步动作或 abort 回调重入；取消不会假装动作已结束。
      const task = { controller, done: Promise.resolve('cancelled' as CommandResult) };
      tasks.set(key, task);
      task.done = Promise.resolve().then(async (): Promise<CommandResult> => {
        if (controller.signal.aborted || commands.get(id) !== command) return 'cancelled';
        try {
          await command.run(Object.freeze({ ...context }), controller.signal);
          return controller.signal.aborted ? 'cancelled' : 'completed';
        } catch { failed(id); return controller.signal.aborted ? 'cancelled' : 'failed'; }
        finally { /* 清理由统一的 promise 收尾完成。 */ }
      }).finally(() => { tasks.delete(key); if (!tasks.size) running.delete(command); notify(); });
      notify(); return task.done;
    },
    subscribe(listener: () => void) { if (closed) throw new Error('命令注册表已关闭'); listeners.add(listener); return () => { listeners.delete(listener); }; },
    inspect: () => Object.freeze({ commands: commands.size, running: [...running.values()].reduce((n, tasks) => n + tasks.size, 0), failures: Object.freeze([...failures]) }),
    close() {
      if (closing) return closing;
      const done = Promise.withResolvers<void>(); closing = done.promise; closed = true;
      const tasks = [...running.values()].flatMap(value => [...value.values()]);
      commands.clear(); listeners.clear(); for (const task of tasks) task.controller.abort();
      void Promise.all(tasks.map(task => task.done)).then(() => done.resolve(), done.reject); return closing;
    },
  });
}

export interface CommandContext { readonly sessionId?: string }
export interface CommandDefinition {
  readonly id: string; readonly label: string;
  readonly shortcut?: { readonly key: string; readonly mod?: boolean; readonly shift?: boolean; readonly allowInput?: boolean };
  readonly enabled?: (context: CommandContext) => boolean;
  readonly run: (context: CommandContext, signal: AbortSignal) => void | Promise<void>;
}
export type CommandResult = 'completed' | 'disabled' | 'missing' | 'busy' | 'cancelled' | 'failed';
export interface CommandRegistry {
  /** 撤销立即禁止新调用并发送取消；返回值等待本命令真实在途动作结束。 */
  register(command: CommandDefinition): () => Promise<void>;
  list(): readonly CommandDefinition[];
  enabled(id: string, context: CommandContext): boolean;
  execute(id: string, context: CommandContext): Promise<CommandResult>;
  subscribe(listener: () => void): () => void;
  inspect(): { readonly commands: number; readonly running: number; readonly failures: readonly string[] };
  close(): Promise<void>;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogValue = null | string | number | boolean | readonly LogValue[] | { readonly [key: string]: LogValue };
export interface LogEvent {
  readonly time: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly fields: Readonly<Record<string, LogValue>>;
}
export interface Logger {
  log(level: LogLevel, message: string, fields?: Readonly<Record<string, unknown>>): void;
  child(context: Readonly<Record<string, unknown>>): Logger;
}
export interface LoggerOptions {
  readonly level?: LogLevel | 'silent';
  readonly context?: Readonly<Record<string, unknown>>;
  readonly write?: (event: LogEvent) => void | Promise<void>;
  /** 异步输出在途上限，超量丢弃并显式通知一次，恢复后允许再次报告拥塞。 */
  readonly maxPendingWrites?: number;
  /** 输出失败通知只提供错误，不重放含敏感数据的原始事件。 */
  readonly onOutputError?: (error: unknown) => void;
}

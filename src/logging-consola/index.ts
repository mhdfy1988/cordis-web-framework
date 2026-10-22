import { createConsola } from 'consola/core';
import type { LogEvent, LogLevel, Logger, LoggerOptions } from '../contracts/logging.ts';
import { sanitizeFields } from './sanitize.ts';
import { freezeData } from '../data/immutable.ts';
export type { Logger, LoggerOptions, LogEvent, LogLevel } from '../contracts/logging.ts';

const levels = { silent: -999, error: 0, warn: 1, info: 3, debug: 4 };

/** 不接管全局 console，不保存日志队列。Consola 负责级别分发，输出器由宿主提供。 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? 'info';
  if (!Object.hasOwn(levels, level)) throw new TypeError('无效日志级别');
  const maxPendingWrites = options.maxPendingWrites ?? 32;
  if (!Number.isInteger(maxPendingWrites) || maxPendingWrites < 1 || maxPendingWrites > 1024) throw new TypeError('无效日志输出在途上限');
  let pending = 0;
  let overflowNotified = false;
  const write = options.write ?? (event => { console[event.level](JSON.stringify(event)); });
  const onError = options.onOutputError ?? (() => { console.error('日志输出失败'); });
  const reportError = (error: unknown) => { try { onError(error); } catch { /* 错误观察器不能破坏业务。 */ } };
  const backend = createConsola({ level: levels[level], throttle: 0, reporters: [{ log(log) {
    if (pending >= maxPendingWrites) {
      if (!overflowNotified) { overflowNotified = true; reportError(new Error('日志输出拥塞，超量事件已丢弃')); }
      return;
    }
    try {
      const output = write(log.args[0] as LogEvent);
      if (output && typeof output.then === 'function') {
        pending++;
        void Promise.resolve(output).then(() => {
          pending--; overflowNotified = false;
        }, error => {
          pending--; overflowNotified = false; reportError(error);
        });
      }
    } catch (error) { reportError(error); }
  } }] });
  function scoped(context: Readonly<Record<string, unknown>>): Logger {
    const bound = sanitizeFields(context);
    return Object.freeze({
      log(severity: LogLevel, message: string, fields: Readonly<Record<string, unknown>> = {}) {
        if (!['debug', 'info', 'warn', 'error'].includes(severity)) throw new TypeError('无效日志级别');
        const safeFields = sanitizeFields(fields);
        const event = freezeData({ time: new Date().toISOString(), level: severity,
          message: message.slice(0, 1024), fields: sanitizeFields({ ...bound, ...safeFields, ...bound }) });
        // 事件含 message 字段，必须按原始对象传递，避免被第三方当作其内部日志选项展开。
        backend[severity].raw(event);
      },
      child(context: Readonly<Record<string, unknown>>) { return scoped({ ...sanitizeFields(context), ...bound }); },
    });
  }
  return scoped(options.context ?? {});
}

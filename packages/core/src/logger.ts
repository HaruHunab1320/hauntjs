export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  child(prefix: string): Logger;
}

/**
 * Creates a structured logger with a prefix and configurable level.
 *
 * @param prefix - Prefix for all log messages, e.g. "[Runtime]"
 * @param level - Minimum level to output. Default: "info"
 */
export function createLogger(prefix: string, level: LogLevel = "info"): Logger {
  const minLevel = LEVEL_ORDER[level];

  function log(lvl: LogLevel, msg: string, args: unknown[]): void {
    if (LEVEL_ORDER[lvl] < minLevel) return;

    const timestamp = new Date().toISOString().slice(11, 19);
    const tag = `${timestamp} [${prefix}]`;

    switch (lvl) {
      case "debug":
        console.debug(tag, msg, ...args);
        break;
      case "info":
        console.log(tag, msg, ...args);
        break;
      case "warn":
        console.warn(tag, msg, ...args);
        break;
      case "error":
        console.error(tag, msg, ...args);
        break;
    }
  }

  return {
    debug: (msg, ...args) => log("debug", msg, args),
    info: (msg, ...args) => log("info", msg, args),
    warn: (msg, ...args) => log("warn", msg, args),
    error: (msg, ...args) => log("error", msg, args),
    child: (childPrefix) => createLogger(`${prefix}:${childPrefix}`, level),
  };
}

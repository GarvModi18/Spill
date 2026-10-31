export type LogLevel = "debug" | "info" | "warn" | "error";

const priorities: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(context: string, minimumLevel: LogLevel = "info") {
  function write(level: LogLevel, message: string, fields: Record<string, unknown> = {}) {
    if (priorities[level] < priorities[minimumLevel]) return;
    const entry = JSON.stringify({
      ...fields,
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
    });
    const output =
      level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    output(entry);
  }
  return {
    debug: (message: string, fields?: Record<string, unknown>) => write("debug", message, fields),
    info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
    warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
    error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
  };
}

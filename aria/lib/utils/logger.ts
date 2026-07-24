export type LogLevel = "debug" | "info" | "warn" | "error";

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const nativeError = console.error.bind(console);
const nativeWarn = console.warn.bind(console);
const nativeInfo = console.info.bind(console);
const nativeDebug = console.debug.bind(console);

const isDev = Boolean(
  import.meta.env?.DEV ??
  (typeof process !== "undefined" && process.env.NODE_ENV !== "production"),
);

const envLevel =
  (import.meta.env?.VITE_LOG_LEVEL as LogLevel | undefined) ||
  (typeof process !== "undefined"
    ? (process.env.LOG_LEVEL as LogLevel | undefined)
    : undefined) ||
  (isDev ? "info" : "warn");

const currentLevel = levelOrder[envLevel] ?? levelOrder.warn;

export function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  if (levelOrder[level] < currentLevel) return;

  const prefix = `[${level.toUpperCase()}]`;

  switch (level) {
    case "error":
      nativeError(`${prefix} ${message}`, context ?? "");
      break;
    case "warn":
      nativeWarn(`${prefix} ${message}`, context ?? "");
      break;
    case "info":
      nativeInfo(`${prefix} ${message}`, context ?? "");
      break;
    case "debug":
      if (isDev) {
        nativeDebug(`${prefix} ${message}`, context ?? "");
      }
      break;
  }
}

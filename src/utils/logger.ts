import pino from "pino";
import pinoPretty from "pino-pretty";

// ============================================================================
// Pino Logger
// ============================================================================

export interface LoggerOptions {
  level?: "trace" | "debug" | "info" | "warn" | "error";
  msgPrefix?: string;
}

export const createLogger = (options: LoggerOptions = {}) => {
  const level = options.level || getLogLevel();

  return pino(
    {
      level,
      msgPrefix: options.msgPrefix || ""
    },
    pinoPretty({
      ignore: "pid,hostname",
      colorize: true,
      translateTime: "SYS:HH:MM:ss.l"
    })
  );
};

export const getLogLevel = (): string => {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && ["trace", "debug", "info", "warn", "error"].includes(envLevel)) {
    return envLevel;
  }
  return "info";
};

export type Logger = ReturnType<typeof createLogger>;

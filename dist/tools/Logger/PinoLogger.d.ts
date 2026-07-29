import pino, { type LevelWithSilentOrString } from "pino";
import { Logger } from "./abstractions/Logger.ts";
type LogTransport = "pretty" | "json";
interface PinoLoggerParams {
  logLevel: LevelWithSilentOrString;
  transport?: LogTransport;
  /**
   * Optional absolute path. When set, the logger fans out to stdout
   * (via transport) AND appends raw pino JSONL to this file. The
   * caller is responsible for mkdir-ing the parent if it doesn't
   * exist — the impl does it defensively anyway.
   */
  logFile?: string;
  /** Internal: prefix prepended to every message (used by child loggers) */
  prefix?: string;
  /** Internal: reuse parent pino instance (used by child loggers) */
  pinoLogger?: pino.Logger;
}
export declare class PinoLogger implements Logger.Interface {
  private readonly logger;
  private readonly transport?;
  private readonly logFile?;
  private readonly prefix;
  constructor(params: PinoLoggerParams);
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  fatal(message: string, ...args: unknown[]): void;
  done(message: string): void;
  child(prefix: string): Logger.Interface;
}
export {};
//# sourceMappingURL=PinoLogger.d.ts.map

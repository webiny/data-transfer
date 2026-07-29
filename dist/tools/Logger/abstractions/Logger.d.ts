interface ILogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  fatal(message: string, ...args: unknown[]): void;
  done(message: string): void;
  /** Create a child logger that prepends `prefix` to every message */
  child(prefix: string): ILogger;
}
export declare const Logger: import("@webiny/di").Abstraction<ILogger>;
export declare namespace Logger {
  type Interface = ILogger;
}
export {};
//# sourceMappingURL=Logger.d.ts.map

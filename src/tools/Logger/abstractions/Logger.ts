import { createAbstraction } from "~/base/index.ts";

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

export const Logger = createAbstraction<ILogger>("Base/Logger");

export namespace Logger {
    export type Interface = ILogger;
}

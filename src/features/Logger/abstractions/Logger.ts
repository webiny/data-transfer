import { createAbstraction } from "@/src/base/index.ts";

interface ILogger {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    fatal(message: string, ...args: unknown[]): void;
    done(message: string): void;
}

export const Logger = createAbstraction<ILogger>("Base/Logger");

export namespace Logger {
    export type Interface = ILogger;
}

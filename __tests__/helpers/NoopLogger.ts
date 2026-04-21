import type { Logger } from "~/tools/Logger/abstractions/Logger.ts";

export interface CapturedLogEntry {
    level: "debug" | "info" | "warn" | "error" | "fatal" | "done";
    message: string;
    args: unknown[];
}

export class NoopLogger implements Logger.Interface {
    public readonly entries: CapturedLogEntry[] = [];

    public debug(message: string, ...args: unknown[]): void {
        this.entries.push({ level: "debug", message, args });
    }
    public info(message: string, ...args: unknown[]): void {
        this.entries.push({ level: "info", message, args });
    }
    public warn(message: string, ...args: unknown[]): void {
        this.entries.push({ level: "warn", message, args });
    }
    public error(message: string, ...args: unknown[]): void {
        this.entries.push({ level: "error", message, args });
    }
    public fatal(message: string, ...args: unknown[]): void {
        this.entries.push({ level: "fatal", message, args });
    }
    public done(message: string): void {
        this.entries.push({ level: "done", message, args: [] });
    }
    public child(): Logger.Interface {
        return this;
    }
}

import pino, { type LevelWithSilentOrString } from "pino";
import { Writable } from "node:stream";
import { Logger } from "./abstractions/Logger.ts";

type LogTransport = "pretty" | "json";

interface PinoLoggerParams {
    logLevel: LevelWithSilentOrString;
    transport?: LogTransport;
    /** Internal: prefix prepended to every message (used by child loggers) */
    prefix?: string;
    /** Internal: reuse parent pino instance (used by child loggers) */
    pinoLogger?: pino.Logger;
}

type JsonLogType = "debug" | "info" | "warn" | "error" | "fatal" | "done";

const LEVEL_TO_TYPE: Record<number, JsonLogType> = {
    20: "debug",
    30: "info",
    40: "warn",
    50: "error",
    60: "fatal"
};

const createJsonDestination = (): Writable => {
    return new Writable({
        write(chunk, _enc, cb) {
            try {
                const entry = JSON.parse(chunk.toString()) as {
                    level: number;
                    msg: string;
                    _done?: boolean;
                };
                const type: JsonLogType = entry._done
                    ? "done"
                    : (LEVEL_TO_TYPE[entry.level] ?? "info");
                process.stdout.write(JSON.stringify({ type, message: entry.msg }) + "\n");
            } catch {
                // ignore malformed lines
            }
            cb();
        }
    });
};

export class PinoLogger implements Logger.Interface {
    private readonly logger: pino.Logger;
    private readonly transport?: LogTransport;
    private readonly prefix: string;

    public constructor(params: PinoLoggerParams) {
        this.transport = params.transport;
        this.prefix = params.prefix ?? "";

        if (params.pinoLogger) {
            this.logger = params.pinoLogger;
            return;
        }

        const base = { level: params.logLevel };

        if (this.transport === "json") {
            this.logger = pino(base, createJsonDestination());
        } else {
            this.logger = pino({
                ...base,
                transport: {
                    target: "pino-pretty",
                    options: {
                        colorize: true,
                        customColors: "fatal:red,error:red,warn:yellow,info:blue,debug:gray",
                        ignore: "pid,hostname,time",
                        messageFormat: "{msg}"
                    }
                }
            });
        }
    }

    public debug(message: string, ...args: unknown[]): void {
        this.logger.debug(this.prefix + message, ...(args as any[]));
    }

    public info(message: string, ...args: unknown[]): void {
        this.logger.info(this.prefix + message, ...(args as any[]));
    }

    public warn(message: string, ...args: unknown[]): void {
        this.logger.warn(this.prefix + message, ...(args as any[]));
    }

    public error(message: string, ...args: unknown[]): void {
        this.logger.error(this.prefix + message, ...(args as any[]));
    }

    public fatal(message: string, ...args: unknown[]): void {
        this.logger.fatal(this.prefix + message, ...(args as any[]));
    }

    public done(message: string): void {
        const prefixed = this.prefix + message;
        if (this.transport === "json") {
            this.logger.info({ _done: true }, prefixed);
            return;
        }
        this.logger.info(prefixed);
    }

    public child(prefix: string): Logger.Interface {
        return new PinoLogger({
            logLevel: this.logger.level as LevelWithSilentOrString,
            transport: this.transport,
            prefix: this.prefix + prefix,
            pinoLogger: this.logger
        });
    }
}

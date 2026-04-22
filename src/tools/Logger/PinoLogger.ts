import pino, { multistream, type LevelWithSilentOrString, type StreamEntry } from "pino";
import pretty from "pino-pretty";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Writable } from "node:stream";
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

const createPrettyDestination = (): Writable => {
    return pretty({
        colorize: true,
        customColors: "fatal:red,error:red,warn:yellow,info:blue,debug:gray",
        ignore: "pid,hostname,time",
        messageFormat: "{msg}"
    });
};

const createFileDestination = (path: string): Writable => {
    mkdirSync(dirname(path), { recursive: true });
    return createWriteStream(path, { flags: "a" });
};

export class PinoLogger implements Logger.Interface {
    private readonly logger: pino.Logger;
    private readonly transport?: LogTransport;
    private readonly logFile?: string;
    private readonly prefix: string;

    public constructor(params: PinoLoggerParams) {
        this.transport = params.transport;
        this.logFile = params.logFile;
        this.prefix = params.prefix ?? "";

        if (params.pinoLogger) {
            this.logger = params.pinoLogger;
            return;
        }

        const consoleStream =
            this.transport === "json" ? createJsonDestination() : createPrettyDestination();

        // Single-stream fast path when there's no log file. Pino routes
        // writes directly to the destination without the multistream
        // wrapper — preserves the synchronous stdout.write semantics the
        // existing JSON-transport tests rely on.
        if (!this.logFile) {
            this.logger = pino({ level: params.logLevel }, consoleStream);
            return;
        }

        // Fan-out: console + raw pino JSONL to file. File content is
        // machine-readable; post-hoc `pino-pretty < file.log` for humans.
        // Explicit level on each stream — multistream defaults to DEFAULT_INFO_LEVEL
        // (30) when level is omitted, which silently drops sub-info messages.
        const streams: StreamEntry[] = [
            { stream: consoleStream, level: params.logLevel as pino.Level },
            { stream: createFileDestination(this.logFile), level: params.logLevel as pino.Level }
        ];
        this.logger = pino({ level: params.logLevel }, multistream(streams));
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
            logFile: this.logFile,
            prefix: this.prefix + prefix,
            pinoLogger: this.logger
        });
    }
}

import { createFeature } from "~/base/index.ts";
import { Logger } from "./abstractions/Logger.ts";
import { PinoLogger } from "./PinoLogger.ts";

interface LoggerFeatureParams {
    logLevel: "debug" | "info" | "warn" | "error";
    json: boolean;
    /**
     * Absolute path to a log file. When set, the logger appends raw
     * pino JSONL to this file in addition to writing to stdout. Caller
     * (bootstrap) resolves the path — the feature just hands it to
     * PinoLogger.
     */
    logFile?: string;
}

export const LoggerFeature = createFeature<LoggerFeatureParams>({
    name: "Base/Logger",
    register(container, params) {
        const logger = new PinoLogger({
            logLevel: params!.logLevel,
            transport: params!.json ? "json" : "pretty",
            logFile: params!.logFile
        });
        container.registerInstance(Logger, logger);
    }
});

import { createFeature } from "~/base/index.ts";
import { Logger } from "./abstractions/Logger.ts";
import { PinoLogger } from "./PinoLogger.ts";

interface LoggerFeatureParams {
    logLevel: "debug" | "info" | "warn" | "error";
    json: boolean;
}

export const LoggerFeature = createFeature<LoggerFeatureParams>({
    name: "Base/Logger",
    register(container, params) {
        const logger = new PinoLogger({
            logLevel: params!.logLevel,
            transport: params!.json ? "json" : "pretty"
        });
        container.registerInstance(Logger, logger);
    }
});

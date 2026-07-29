import { createFeature } from "../../base/index.js";
import { Logger } from "./abstractions/Logger.js";
import { PinoLogger } from "./PinoLogger.js";
export const LoggerFeature = createFeature({
  name: "Base/Logger",
  register(container, params) {
    const logger = new PinoLogger({
      logLevel: params.logLevel,
      transport: params.json ? "json" : "pretty",
      logFile: params.logFile
    });
    container.registerInstance(Logger, logger);
  }
});
//# sourceMappingURL=feature.js.map

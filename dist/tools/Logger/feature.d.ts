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
export declare const LoggerFeature: {
  name: string;
  register(container: import("@webiny/di").Container, context: LoggerFeatureParams): void;
};
export {};
//# sourceMappingURL=feature.d.ts.map

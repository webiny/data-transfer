import { handler } from "./handler.js";
export function registerProcessSegmentCommand(yargs) {
  return yargs.command(
    "process-segment",
    "Process a specific DDB segment (used internally by worker processes)",
    yargs => {
      return yargs
        .option("runId", { type: "string", demandOption: true, description: "Run ID" })
        .option("segment", {
          type: "number",
          demandOption: true,
          description: "Segment number"
        })
        .option("total", {
          type: "number",
          demandOption: true,
          description: "Total segments"
        })
        .option("config", {
          type: "string",
          demandOption: true,
          description: "Config file path"
        })
        .option("preset", {
          type: "string",
          demandOption: true,
          description: "Preset name to use for this segment"
        })
        .option("log-level", {
          type: "string",
          choices: ["debug", "info", "warn", "error"],
          description: "Log level"
        })
        .option("dry-run", {
          type: "boolean",
          default: false,
          description: "Skip all writes to the target system"
        });
    },
    async argv => {
      await handler({
        ...argv,
        logLevel: argv["log-level"],
        preset: argv.preset,
        dryRun: argv["dry-run"]
      });
    }
  );
}
//# sourceMappingURL=register.js.map

import { handler } from "./handler.js";
import { parseSegmentsFilter } from "./segmentsFilter.js";
import { TransferWizard } from "./wizard/TransferWizard.js";
import { ExitPromptError } from "@inquirer/core";
export function registerRunCommand(yargs) {
  return yargs.command(
    "$0",
    "Transfer Webiny data using a configuration file",
    yargs => {
      return yargs
        .option("config", {
          type: "string",
          demandOption: false,
          description: "Path to configuration file"
        })
        .option("segments", {
          type: "string",
          description:
            "Comma-separated list of segment indices to run (e.g. `1,3`). " +
            "Use to re-run specific shards after a failure. Defaults to all."
        })
        .coerce("segments", parseSegmentsFilter)
        .option("log-level", {
          type: "string",
          choices: ["debug", "info", "warn", "error"],
          description: "Log level (default: info)"
        });
    },
    async argv => {
      const wizard = new TransferWizard(process.cwd());
      try {
        const result = await wizard.run();
        if (result === null) {
          process.exit(0);
        }
        await handler(
          result.configPath,
          result.preset,
          argv.segments,
          argv["log-level"],
          result.dryRun
        );
      } catch (err) {
        if (err instanceof ExitPromptError) {
          process.exit(0);
        }
        throw err;
      }
    }
  );
}
//# sourceMappingURL=register.js.map

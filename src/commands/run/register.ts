import type { Argv } from "yargs";
import { handler } from "./handler.ts";
import { parseSegmentsFilter } from "./segmentsFilter.ts";
import { TransferWizard } from "./wizard/TransferWizard.ts";
import { ExitPromptError } from "@inquirer/core";

export function registerRunCommand(yargs: Argv): Argv {
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
                .option("preset", {
                    type: "string",
                    demandOption: false,
                    description: "Preset name to run"
                })
                .option("dry-run", {
                    type: "boolean",
                    default: false,
                    description: "Read source but skip all writes to target"
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
                    choices: ["debug", "info", "warn", "error"] as const,
                    description: "Log level (default: info)"
                });
        },
        async argv => {
            const configPath = argv.config as string | undefined;
            const preset = argv.preset as string | undefined;
            const logLevel = argv["log-level"] as string | undefined;
            const dryRun = argv["dry-run"] as boolean;

            if (configPath && preset) {
                await handler(configPath, preset, argv.segments, logLevel, dryRun);
                return;
            }

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
                    logLevel,
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

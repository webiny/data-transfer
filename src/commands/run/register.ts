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
            if (argv.config) {
                await handler(argv.config, argv.segments, argv["log-level"] as string | undefined);
                return;
            }

            const wizard = new TransferWizard(process.cwd());
            try {
                const configPath = await wizard.run();
                if (configPath === null) {
                    process.exit(0);
                }
                await handler(
                    configPath,
                    argv.segments,
                    argv["log-level"] as string | undefined
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

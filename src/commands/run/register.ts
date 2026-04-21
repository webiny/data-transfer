import type { Argv } from "yargs";
import { handler } from "./handler.ts";
import { parseSegmentsFilter } from "./segmentsFilter.ts";

export function registerRunCommand(yargs: Argv): Argv {
    return yargs.command(
        "$0",
        "Transfer Webiny data using a configuration file",
        yargs => {
            return yargs
                .option("config", {
                    type: "string",
                    demandOption: true,
                    description: "Path to configuration file"
                })
                .option("segments", {
                    type: "string",
                    description:
                        "Comma-separated list of segment indices to run (e.g. `1,3`). " +
                        "Use to re-run specific shards after a failure. Defaults to all."
                })
                .coerce("segments", parseSegmentsFilter);
        },
        async argv => {
            await handler(argv.config, argv.segments);
        }
    );
}

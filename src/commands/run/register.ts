import type { Argv } from "yargs";
import { handler } from "./handler.ts";

export function registerRunCommand(yargs: Argv): Argv {
    return yargs.command(
        "$0",
        "Transfer Webiny data using a configuration file",
        yargs => {
            return yargs.option("config", {
                type: "string",
                demandOption: true,
                description: "Path to configuration file"
            });
        },
        async argv => {
            await handler(argv.config);
        }
    );
}

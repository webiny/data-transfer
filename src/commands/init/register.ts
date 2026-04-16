import type { Argv } from "yargs";
import { handler } from "./handler.ts";

export function registerInitCommand(yargs: Argv): Argv {
    return yargs.command(
        "init <folder>",
        "Scaffold a new data transfer project",
        yargs => {
            return yargs.positional("folder", {
                type: "string",
                demandOption: true,
                description: "Name of the folder to create"
            });
        },
        async argv => {
            await handler(argv.folder as string);
        }
    );
}

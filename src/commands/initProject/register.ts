import type { Argv } from "yargs";
import { handler } from "./handler.ts";

export function registerInitProjectCommand(yargs: Argv): Argv {
    return yargs.command(
        "init-project <name>",
        "Scaffold a new project in the projects/ directory",
        yargs => {
            return yargs.positional("name", {
                type: "string",
                demandOption: true,
                description: "Name of the project folder to create under projects/"
            });
        },
        async argv => {
            await handler(argv.name as string);
        }
    );
}

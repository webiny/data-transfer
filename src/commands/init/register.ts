import type { Argv } from "yargs";
import { handler } from "./handler.ts";

export function registerInitCommand(yargs: Argv): Argv {
    return yargs.command(
        "init <project-name>",
        "Scaffold a new data transfer project",
        yargs => {
            return yargs.positional("project-name", {
                type: "string",
                demandOption: true,
                description: "Name of the project directory to create"
            });
        },
        async argv => {
            await handler({
                projectName: argv["project-name"] as string
            });
        }
    );
}

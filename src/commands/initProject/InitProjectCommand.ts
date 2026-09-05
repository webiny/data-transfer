import type { Argv } from "yargs";
import { Command as CommandAbstraction } from "~/commands/registry/abstractions/Command.js";
import { EXIT_OK } from "~/commands/exitCodes.js";
import { handler } from "./handler.ts";

class InitProjectCommandImpl implements CommandAbstraction.Interface {
    public readonly name = "init-project <name>";
    public readonly description = "Scaffold a new project in the projects/ directory";
    public readonly hidden = true;

    public configure(yargs: Argv): Argv {
        return yargs.positional("name", {
            type: "string",
            demandOption: true,
            description: "Name of the project folder to create under projects/"
        });
    }

    public async run(argv: CommandAbstraction.Argv): Promise<number> {
        await handler(argv.name as string);
        return EXIT_OK;
    }
}

export const InitProjectCommand = CommandAbstraction.createImplementation({
    implementation: InitProjectCommandImpl,
    dependencies: []
});

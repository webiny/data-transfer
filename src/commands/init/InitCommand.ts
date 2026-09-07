import type { Argv } from "yargs";
import { Command as CommandAbstraction } from "~/commands/registry/abstractions/Command.js";
import { EXIT_OK } from "~/commands/exitCodes.js";
import { handler } from "./handler.ts";

class InitCommandImpl implements CommandAbstraction.Interface {
    public readonly name = "init <project-name>";
    public readonly description = "Scaffold a new data transfer project";
    public readonly hidden = true;

    public configure(yargs: Argv): Argv {
        return yargs.positional("project-name", {
            type: "string",
            demandOption: true,
            description: "Name of the project directory to create"
        });
    }

    public async run(argv: CommandAbstraction.Argv): Promise<number> {
        await handler({ projectName: argv["project-name"] as string });
        return EXIT_OK;
    }
}

export const InitCommand = CommandAbstraction.createImplementation({
    implementation: InitCommandImpl,
    dependencies: []
});

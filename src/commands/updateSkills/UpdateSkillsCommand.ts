import type { Argv } from "yargs";
import { Command as CommandAbstraction } from "~/commands/registry/abstractions/Command.js";
import { EXIT_OK } from "~/commands/exitCodes.js";
import { handler } from "./handler.ts";

class UpdateSkillsCommandImpl implements CommandAbstraction.Interface {
    public readonly name = "update-skills";
    public readonly description =
        "Update Claude Code skills from the installed @webiny/data-transfer package";
    public readonly hidden = true;

    public configure(yargs: Argv): Argv {
        return yargs;
    }

    public async run(): Promise<number> {
        handler();
        return EXIT_OK;
    }
}

export const UpdateSkillsCommand = CommandAbstraction.createImplementation({
    implementation: UpdateSkillsCommandImpl,
    dependencies: []
});

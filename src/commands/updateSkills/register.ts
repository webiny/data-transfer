import type { Argv } from "yargs";
import { handler } from "./handler.ts";

export function registerUpdateSkillsCommand(yargs: Argv): Argv {
    return yargs.command(
        "update-skills",
        "Update Claude Code skills from the installed @webiny/data-transfer package",
        () => {},
        () => {
            handler();
        }
    );
}

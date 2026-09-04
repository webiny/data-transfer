import type { Command } from "./registry/abstractions/Command.ts";
import type { CommandRegistry } from "./registry/abstractions/CommandRegistry.ts";

export interface DispatchDefaultInput {
    argv: Command.Argv;
    registry: CommandRegistry.Interface;
    openMenu: () => Promise<number>;
}

export async function dispatchDefault(input: DispatchDefaultInput): Promise<number> {
    const { argv, registry, openMenu } = input;
    const folder = argv.folder;
    if (typeof folder === "string" && folder.length > 0) {
        return registry.get("init").run({ ...argv, "project-name": folder });
    }
    if (argv.config || argv.preset) {
        return registry.get("transfer").run(argv);
    }
    return openMenu();
}

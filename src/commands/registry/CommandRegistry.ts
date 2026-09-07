import type { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.js";
import { Command } from "./abstractions/Command.ts";
import { CommandRegistry as CommandRegistryAbstraction } from "./abstractions/CommandRegistry.ts";

const baseName = (name: string): string => name.split(" ")[0]!;

class CommandRegistryImpl implements CommandRegistryAbstraction.Interface {
    private commands: Command.Interface[] | null = null;

    public constructor(private readonly container: Container) {}

    public list(): Command.Interface[] {
        if (this.commands === null) {
            this.commands = this.container.resolveAll(Command);
        }
        return this.commands;
    }

    public menu(): Command.Interface[] {
        return this.list().filter(command => command.hidden !== true);
    }

    public get(name: string): Command.Interface {
        const found = this.list().find(command => baseName(command.name) === name);
        if (!found) {
            const known = this.list()
                .map(command => baseName(command.name))
                .join(", ");
            throw new Error(`Unknown command "${name}". Known commands: ${known}`);
        }
        return found;
    }
}

export const CommandRegistry = CommandRegistryAbstraction.createImplementation({
    implementation: CommandRegistryImpl,
    dependencies: [ContainerToken]
});

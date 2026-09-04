import { createAbstraction } from "~/base/index.js";
import type { Command } from "./Command.ts";

export interface ICommandRegistry {
    list(): Command.Interface[];
    menu(): Command.Interface[];
    get(name: string): Command.Interface;
}

export const CommandRegistry = createAbstraction<ICommandRegistry>("Cli/CommandRegistry");

export namespace CommandRegistry {
    export type Interface = ICommandRegistry;
}

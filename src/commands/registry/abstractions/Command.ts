import type { Argv as YargsArgv } from "yargs";
import { createAbstraction } from "~/base/index.js";

export type CommandArgv = Record<string, unknown>;

export interface ICommand {
    readonly name: string;
    readonly description: string;
    readonly hidden?: boolean;
    configure(yargs: YargsArgv): YargsArgv;
    run(argv: CommandArgv): Promise<number>;
}

export const Command = createAbstraction<ICommand>("Cli/Command");

export namespace Command {
    export type Interface = ICommand;
    export type Argv = CommandArgv;
}

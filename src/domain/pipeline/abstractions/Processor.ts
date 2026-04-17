import { createAbstraction } from "~/base/index.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";

interface IProcessorContext {
    readonly commands: Commands;
}

interface IProcessor<TRecord = unknown, TContext extends IProcessorContext = IProcessorContext> {
    execute(commands: Commands): Promise<void>;
    getShardState(): unknown;
    createContext(record: TRecord): TContext;
}

export const Processor = createAbstraction<IProcessor>("Core/Processor");

export namespace Processor {
    export type Interface<
        TRecord = unknown,
        TContext extends IProcessorContext = IProcessorContext
    > = IProcessor<TRecord, TContext>;
    export type Context = IProcessorContext;
}

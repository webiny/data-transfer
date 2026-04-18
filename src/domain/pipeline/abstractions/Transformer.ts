import type { Processor } from "./Processor.ts";

export namespace Transformer {
    export type Interface<TContext extends Processor.Context = Processor.Context> = (
        ctx: TContext
    ) => void | Promise<void>;
}

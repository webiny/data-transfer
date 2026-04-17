import { createAbstraction } from "~/base/index.ts";
import type { Processor } from "./Processor.ts";

interface ITransformer<TContext extends Processor.Context = Processor.Context> {
    transform(ctx: TContext): void | Promise<void>;
}

export const Transformer = createAbstraction<ITransformer>("Core/Transformer");

export namespace Transformer {
    export type Interface<TContext extends Processor.Context = Processor.Context> =
        ITransformer<TContext>;
}

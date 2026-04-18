import type { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import type { Transformer } from "~/domain/pipeline/abstractions/Transformer.ts";

export function createTransformer<TContext extends Processor.Context>(
    name: string,
    fn: Transformer.Interface<TContext>
): Transformer.Interface<TContext> {
    Object.defineProperty(fn, "transformerName", {
        value: name,
        enumerable: false,
        writable: false,
        configurable: false
    });
    return fn;
}

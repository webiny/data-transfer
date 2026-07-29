import type { Processor } from "~/domain/pipeline/abstractions/Processor.js";
import type { Transformer } from "~/domain/pipeline/abstractions/Transformer.js";

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

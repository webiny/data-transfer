import type { DdbTransformContext } from "~/features/TransformContext/abstractions/contextAliases.js";
import type { Transformer } from "~/domain/pipeline/abstractions/Transformer.js";
import { createTransformer } from "./createTransformer.ts";

export function createDdbTransformer(
    name: string,
    fn: Transformer.Interface<DdbTransformContext.Interface>
): Transformer.Interface<DdbTransformContext.Interface> {
    return createTransformer<DdbTransformContext.Interface>(name, fn);
}

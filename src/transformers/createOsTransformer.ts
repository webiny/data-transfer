import type { OsTransformContext } from "~/features/TransformContext/abstractions/OsTransformContext.ts";
import type { OsScanner } from "~/features/OsScanner/index.ts";
import type { Transformer } from "~/domain/pipeline/abstractions/Transformer.ts";
import { createTransformer } from "./createTransformer.ts";

export function createOsTransformer(
    name: string,
    fn: Transformer.Interface<OsTransformContext.Interface<OsScanner.Record>>
): Transformer.Interface<OsTransformContext.Interface<OsScanner.Record>> {
    return createTransformer<OsTransformContext.Interface<OsScanner.Record>>(name, fn);
}

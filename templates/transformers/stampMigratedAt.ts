import { createTransformer } from "@webiny/data-transfer";
import type { BaseTransformContext } from "@webiny/data-transfer";

/**
 * Example custom transformer.
 *
 * A transformer is a plain function that mutates `ctx.record`. The runner
 * auto-emits a PutRecord for the final state of `ctx.record` after the whole
 * chain runs, so most transformers just need to mutate — no need to call
 * `ctx.putRecord(ctx.record)` yourself.
 *
 * Use `createTransformer(name, fn)` for processor-agnostic transformers
 * (ctx is just `BaseTransformContext` — no slice helpers). For transformers
 * that need DDB/S3 helpers on ctx, reach for `createDdbTransformer`; for
 * OpenSearch, `createOsTransformer`.
 */
export const stampMigratedAt = createTransformer<BaseTransformContext.Interface>(
    "stampMigratedAt",
    ctx => {
        (ctx.record as Record<string, unknown>).migratedAt = new Date().toISOString();
    }
);

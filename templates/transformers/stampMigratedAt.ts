import { createDdbTransformer } from "@webiny/data-transfer";
import type { DdbTransformContext } from "@webiny/data-transfer";

/**
 * Example custom transformer.
 *
 * A transformer is a plain function that mutates `ctx.record`. The runner
 * auto-emits a PutRecord for the final state of `ctx.record` after the whole
 * chain runs, so most transformers just need to mutate — no need to call
 * `ctx.putRecord(ctx.record)` yourself.
 *
 * Use `createDdbTransformer(name, fn)` (or `createOsTransformer`) to wrap the
 * function with a named, DI-friendly factory.
 */
export const stampMigratedAt = createDdbTransformer(
    "stampMigratedAt",
    (ctx: DdbTransformContext.Interface) => {
        (ctx.record as Record<string, unknown>).migratedAt = new Date().toISOString();
    }
);

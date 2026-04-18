import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

// Reserved top-level attributes that should NOT be wrapped in data
const RESERVED_ATTRIBUTES = new Set([
    "PK",
    "SK",
    "GSI_TENANT",
    "GSI1_PK",
    "GSI1_SK",
    "GSI2_PK",
    "GSI2_SK",
    "TYPE",
    "data",
    "expiresAt",
    "_ct",
    "_et",
    "_md"
]);

/**
 * Wraps all non-reserved attributes in a `data` envelope
 */
export const wrapInData = createTransformer<BaseTransformContext.Interface>("wrapInData", ctx => {
    const { record } = ctx;

    // If data already exists, don't wrap again
    if (record.data) {
        return;
    }

    const dataEnvelope: Record<string, unknown> = {};
    const newRecord: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
        if (RESERVED_ATTRIBUTES.has(key)) {
            newRecord[key] = value;
        } else {
            dataEnvelope[key] = value;
        }
    }

    newRecord.data = dataEnvelope;
    ctx.replace(newRecord);
});

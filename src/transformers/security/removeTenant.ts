import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

/**
 * Removes the tenant attribute from security role records
 */
export const removeTenant = createTransformer<BaseTransformContext.Interface<BaseRecord>>(
    "removeTenant",
    ctx => {
        delete ctx.record.tenant;
    }
);

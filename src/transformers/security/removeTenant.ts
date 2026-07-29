import { createTransformer } from "~/transformers/createTransformer.js";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";

/**
 * Removes the tenant attribute from security role records
 */
export const removeTenant = createTransformer<BaseTransformContext.Interface<BaseRecord>>(
    "removeTenant",
    ctx => {
        delete ctx.record.tenant;
    }
);

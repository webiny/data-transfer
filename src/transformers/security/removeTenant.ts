import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

/**
 * Removes the tenant attribute from security role records
 */
export const removeTenant = createTransformer<BaseTransformContext.Interface>(
    "removeTenant",
    ctx => {
        delete ctx.record.tenant;
    }
);

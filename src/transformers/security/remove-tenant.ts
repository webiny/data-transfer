import type { Transformer } from "~/domain/transform/Transformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

/**
 * Removes the tenant attribute from security role records
 */
export const removeTenantAttribute: Transformer = {
    name: "removeTenantAttribute",
    transform(ctx: BaseTransformContext.Interface) {
        delete ctx.record.tenant;
    }
};

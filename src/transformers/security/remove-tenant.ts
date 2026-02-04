import { Transformer } from "../../core/transformer.ts";
import { TransformContext } from "../../core/types.ts";

/**
 * Removes the tenant attribute from security role records
 */
export const removeTenantAttribute: Transformer = {
  name: "removeTenantAttribute",
  transform(ctx: TransformContext) {
    delete ctx.record.tenant;
  }
};

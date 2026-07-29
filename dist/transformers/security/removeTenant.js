import { createTransformer } from "../../transformers/createTransformer.js";
/**
 * Removes the tenant attribute from security role records
 */
export const removeTenant = createTransformer("removeTenant", ctx => {
  delete ctx.record.tenant;
});
//# sourceMappingURL=removeTenant.js.map

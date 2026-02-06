import { Transformer } from "../../core/transformer.ts";
import { TransformContext } from "../../core/types.ts";

/**
 * Removes deprecated/obsolete attributes globally:
 * - tenant: Now stored in PK/SK keys via GSI_TENANT
 * - webinyVersion: No longer needed in v6
 */
export const removeAttributes: Transformer = {
  name: "removeAttributes",
  transform(ctx: TransformContext) {
    const { record } = ctx;

    // Remove tenant attribute if it exists
    if (record.tenant !== undefined) {
      delete record.tenant;
    }

    // Remove webinyVersion if it exists
    if (record.webinyVersion !== undefined) {
      delete record.webinyVersion;
    }
  }
};

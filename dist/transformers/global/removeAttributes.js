import { createTransformer } from "../../transformers/createTransformer.js";
/**
 * Removes deprecated/obsolete attributes globally:
 * NOTE: This transformer expects wrapInData to run FIRST, so attributes are in data envelope.
 * - tenant: Now stored in PK/SK keys via GSI_TENANT
 * - webinyVersion: No longer needed in v6
 */
export const removeAttributes = createTransformer("removeAttributes", ctx => {
  const { record } = ctx;
  // Remove from data envelope
  if (record.data && typeof record.data === "object") {
    const data = record.data;
    // Remove webinyVersion if it exists
    if (data.webinyVersion !== undefined) {
      delete data.webinyVersion;
    }
  }
});
//# sourceMappingURL=removeAttributes.js.map

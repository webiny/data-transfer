import { Transformer } from "../../core/transformer.ts";
import { TransformContext } from "../../core/types.ts";

/**
 * Adds GSI_TENANT attribute by extracting tenant ID from PK or data.tenant
 */
export const addGsiTenant: Transformer = {
  name: "addGsiTenant",
  transform(ctx: TransformContext) {
    const { record } = ctx;

    // Skip if GSI_TENANT already exists
    if (record.GSI_TENANT) {
      return;
    }

    // Try to extract tenant from PK (e.g., T#root#... -> root)
    if (typeof record.PK === "string" && record.PK.startsWith("T#")) {
      const parts = record.PK.split("#");
      if (parts.length >= 2) {
        record.GSI_TENANT = parts[1];
        return;
      }
    }

    // Try to extract from data.tenant
    if (record.data && typeof record.data === "object") {
      const data = record.data as Record<string, unknown>;
      if (typeof data.tenant === "string") {
        record.GSI_TENANT = data.tenant;
        return;
      }
    }

    // Fallback: try record.tenant (before wrapping in data)
    if (typeof record.tenant === "string") {
      record.GSI_TENANT = record.tenant;
    }
  }
};

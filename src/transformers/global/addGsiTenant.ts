import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

/**
 * Adds GSI_TENANT attribute by extracting tenant ID from PK or data.tenant.
 * NOTE: This transformer expects wrapInData to run FIRST, so tenant is in data.tenant.
 */
export const addGsiTenant = createTransformer<BaseTransformContext.Interface<BaseRecord>>(
    "addGsiTenant",
    ctx => {
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

        // Try to extract from data.tenant (wrapInData already ran)
        if (record.data && typeof record.data === "object") {
            const data = record.data as Record<string, unknown>;
            if (typeof data.tenant === "string") {
                record.GSI_TENANT = data.tenant;
                return;
            }
        }
    }
);

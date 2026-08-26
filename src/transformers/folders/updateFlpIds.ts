import { createTransformer } from "~/transformers/createTransformer.js";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";

/**
 * Removes #0001 revision from data.id and data.parentId in FLP records.
 * Note: FLP records already have data attribute, so wrapInData doesn't wrap them again
 */
export const updateFlpIds = createTransformer<BaseTransformContext.Interface<BaseRecord>>(
    "updateFlpIds",
    ctx => {
        const { record } = ctx;

        if (!record.data || typeof record.data !== "object") {
            return;
        }
        const data = record.data as Record<string, unknown>;

        // Remove #0001 from id
        if (typeof data.id === "string") {
            data.id = data.id.replace(/#0001$/, "");
        }

        // Remove #0001 from parentId
        if (typeof data.parentId === "string") {
            data.parentId = data.parentId.replace(/#0001$/, "");
        }

        if (!Array.isArray(data.permissions)) {
            return;
        }

        for (const permission of data.permissions) {
            if (!permission || typeof permission !== "object") {
                continue;
            }

            const perm = permission as Record<string, unknown>;

            if (typeof perm.inheritedFrom !== "string") {
                continue;
            }

            perm.inheritedFrom = perm.inheritedFrom.replace(/#0001$/, "");
        }
    }
);

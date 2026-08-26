import { createTransformer } from "~/transformers/createTransformer.js";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";

const stripRevision = (value: string) => value.replace(/#\d{4}$/, "");

export const updateFlpIds = createTransformer<BaseTransformContext.Interface<BaseRecord>>(
    "updateFlpIds",
    ctx => {
        const { record } = ctx;

        if (!record.data || typeof record.data !== "object") {
            return;
        }
        const data = record.data as Record<string, unknown>;

        if (typeof data.id === "string") {
            data.id = stripRevision(data.id);
        }

        if (typeof data.parentId === "string") {
            data.parentId = stripRevision(data.parentId);
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

            perm.inheritedFrom = stripRevision(perm.inheritedFrom);
        }
    }
);

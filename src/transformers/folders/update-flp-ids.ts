import { Transformer } from "../../core/transformer.ts";
import { TransformContext } from "../../core/types.ts";

/**
 * Removes #0001 revision from data.id and data.parentId in FLP records.
 * Note: FLP records already have data attribute, so wrapInData doesn't wrap them again
 */
export const updateFlpIds: Transformer = {
    name: "updateFlpIds",
    transform(ctx: TransformContext) {
        const { record } = ctx;

        if (record.data && typeof record.data === "object") {
            const data = record.data as Record<string, unknown>;

            // Remove #0001 from id
            if (typeof data.id === "string") {
                data.id = data.id.replace(/#0001$/, "");
            }

            // Remove #0001 from parentId
            if (typeof data.parentId === "string") {
                data.parentId = data.parentId.replace(/#0001$/, "");
            }
        }
    }
};

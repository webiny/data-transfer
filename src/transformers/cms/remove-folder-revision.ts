import { Transformer } from "../../core/transformer.ts";
import { TransformContext } from "../../core/types.ts";

/**
 * Handles folder location transformations:
 * NOTE: This transformer expects wrapInData to run FIRST.
 * 1. Processes location from data.location
 * 2. Removes location from data.values["object@location"] if it exists there
 * 3. Removes revision number #0001 from folderId
 */
export const removeFolderRevision: Transformer = {
    name: "removeFolderRevision",
    transform(ctx: TransformContext) {
        const { record } = ctx;

        // Extract data envelope
        const data = record.data as Record<string, unknown> | undefined;
        if (!data) {
            return; // No data envelope
        }

        // Handle data.location
        if (data.location && typeof data.location === "object") {
            const location = data.location as Record<string, unknown>;

            // Remove #0001 from folderId
            if (typeof location.folderId === "string") {
                location.folderId = location.folderId.replace(/#0001$/, "");
            }
        }

        // Remove location from values if it exists there (it should be at data.location)
        if (data.values && typeof data.values === "object") {
            const values = data.values as Record<string, unknown>;

            // Remove object@location from values
            if (values["object@location"]) {
                delete values["object@location"];
            }

            // Remove revision from parentId for folder entries only
            const modelId = data.modelId as string | undefined;
            if (modelId === "wbyAcoFolder" && typeof values["text@parentId"] === "string") {
                values["text@parentId"] = (values["text@parentId"] as string).replace(/#\d+$/, "");
            }
        }
    }
};

import { Transformer } from "../../core/transformer.ts";
import { TransformContext } from "../../core/types.ts";

/**
 * Handles folder location transformations:
 * 1. Moves location from root level to data.location (if it exists at root)
 * 2. Removes location from values["object@location"] if it exists there
 * 3. Removes revision number #0001 from folderId
 */
export const removeFolderRevision: Transformer = {
  name: "removeFolderRevision",
  transform(ctx: TransformContext) {
    const { record } = ctx;

    // Handle root-level location (before wrapping)
    // This will be wrapped into data.location by wrapInData transformer
    if (record.location && typeof record.location === "object") {
      const location = record.location as Record<string, unknown>;

      // Remove #0001 from folderId
      if (typeof location.folderId === "string") {
        location.folderId = location.folderId.replace(/#0001$/, "");
      }
    }

    // Remove location from values if it exists there (it should be at root level)
    if (record.values && typeof record.values === "object") {
      const values = record.values as Record<string, unknown>;

      // Remove object@location from values
      if (values["object@location"]) {
        delete values["object@location"];
      }
    }
  }
};

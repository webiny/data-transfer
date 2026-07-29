import { createTransformer } from "../../transformers/createTransformer.js";
/**
 * Handles folder location transformations:
 * NOTE: This transformer expects wrapInData to run FIRST.
 * 1. Processes location from data.location
 * 2. Removes location from data.values["object@location"] if it exists there
 * 3. Removes revision number #0001 from folderId
 */
export const removeFolderRevision = createTransformer("removeFolderRevision", ctx => {
  const { record } = ctx;
  // Extract data envelope
  const data = record.data;
  if (!data) {
    return; // No data envelope
  }
  // Handle data.location
  if (data.location && typeof data.location === "object") {
    const location = data.location;
    // Remove #0001 from folderId
    if (typeof location.folderId === "string") {
      location.folderId = location.folderId.replace(/#0001$/, "");
    }
  }
  // Remove location from values if it exists there (it should be at data.location)
  if (data.values && typeof data.values === "object") {
    const values = data.values;
    // Remove object@location from values
    if (values["object@location"]) {
      delete values["object@location"];
    }
    // Remove revision from parentId for folder entries only
    const modelId = data.modelId;
    if (modelId === "wbyAcoFolder" && typeof values["text@parentId"] === "string") {
      values["text@parentId"] = values["text@parentId"].replace(/#\d+$/, "");
    }
  }
});
//# sourceMappingURL=removeFolderRevision.js.map

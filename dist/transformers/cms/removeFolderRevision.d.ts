import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
import type { BaseRecord } from "../../domain/transform/types/records.js";
/**
 * Handles folder location transformations:
 * NOTE: This transformer expects wrapInData to run FIRST.
 * 1. Processes location from data.location
 * 2. Removes location from data.values["object@location"] if it exists there
 * 3. Removes revision number #0001 from folderId
 */
export declare const removeFolderRevision: import("../../index.ts").Transformer.Interface<
  BaseTransformContext.Interface<BaseRecord>
>;
//# sourceMappingURL=removeFolderRevision.d.ts.map

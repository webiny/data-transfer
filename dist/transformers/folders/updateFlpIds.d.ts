import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
import type { BaseRecord } from "../../domain/transform/types/records.js";
/**
 * Removes #0001 revision from data.id and data.parentId in FLP records.
 * Note: FLP records already have data attribute, so wrapInData doesn't wrap them again
 */
export declare const updateFlpIds: import("../../index.ts").Transformer.Interface<
  BaseTransformContext.Interface<BaseRecord>
>;
//# sourceMappingURL=updateFlpIds.d.ts.map

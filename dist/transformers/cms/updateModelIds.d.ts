import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
import type { BaseRecord } from "../../domain/transform/types/records.js";
/**
 * Updates modelIds in keys and data.modelId attribute.
 * NOTE: This transformer expects wrapInData to run FIRST, so modelId is in data.modelId.
 */
export declare const updateModelIds: import("../../index.ts").Transformer.Interface<
  BaseTransformContext.Interface<BaseRecord>
>;
//# sourceMappingURL=updateModelIds.d.ts.map

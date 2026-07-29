import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
import type { BaseRecord } from "../../domain/transform/types/records.js";
/**
 * Recursively renames field attributes in CMS model definitions:
 * - helpText → description
 * - placeholderText → placeholder
 */
export declare const renameFieldAttributes: import("../../index.ts").Transformer.Interface<
  BaseTransformContext.Interface<BaseRecord>
>;
//# sourceMappingURL=renameFieldAttributes.d.ts.map

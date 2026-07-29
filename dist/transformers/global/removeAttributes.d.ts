import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
import type { BaseRecord } from "../../domain/transform/types/records.js";
/**
 * Removes deprecated/obsolete attributes globally:
 * NOTE: This transformer expects wrapInData to run FIRST, so attributes are in data envelope.
 * - tenant: Now stored in PK/SK keys via GSI_TENANT
 * - webinyVersion: No longer needed in v6
 */
export declare const removeAttributes: import("../../index.ts").Transformer.Interface<
  BaseTransformContext.Interface<BaseRecord>
>;
//# sourceMappingURL=removeAttributes.d.ts.map

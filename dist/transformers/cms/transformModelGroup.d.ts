import type { DdbCoreTransformContext } from "../../features/TransformContext/abstractions/contextAliases.js";
import type { BaseRecord } from "../../domain/transform/types/records.js";
/**
 * Transforms CMS model records:
 * NOTE: This transformer expects wrapInData to run FIRST, so group is in data.group.
 * - Replaces group object with group slug (resolves group ID to slug)
 */
export declare const transformModelGroup: import("../../index.ts").Transformer.Interface<
  DdbCoreTransformContext.Interface<BaseRecord>
>;
//# sourceMappingURL=transformModelGroup.d.ts.map

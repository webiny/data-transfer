import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
import type { BaseRecord } from "../../domain/transform/types/records.js";
/**
 * Removes locale codes (e.g., L#en-US#) from PK, SK, and GSI keys,
 * and removes the locale field from the record.
 */
export declare const removeLocale: import("../../index.ts").Transformer.Interface<
  BaseTransformContext.Interface<BaseRecord>
>;
//# sourceMappingURL=removeLocale.d.ts.map

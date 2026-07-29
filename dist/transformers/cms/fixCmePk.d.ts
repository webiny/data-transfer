import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
import type { BaseRecord } from "../../domain/transform/types/records.js";
/**
 * Removes duplicate #CME# from PK
 * Before: T#root#L#en-US#CMS#CME#CME#698262002baa500002afd371
 * After: T#root#CMS#CME#697fba1ee12d630002b7ad15
 */
export declare const fixCmePk: import("../../index.ts").Transformer.Interface<
  BaseTransformContext.Interface<BaseRecord>
>;
//# sourceMappingURL=fixCmePk.d.ts.map

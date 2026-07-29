import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
import type { BaseRecord } from "../../domain/transform/types/records.js";
/**
 * Adds GSI_TENANT attribute by extracting tenant ID from PK or data.tenant.
 * NOTE: This transformer expects wrapInData to run FIRST, so tenant is in data.tenant.
 */
export declare const addGsiTenant: import("../../index.ts").Transformer.Interface<
  BaseTransformContext.Interface<BaseRecord>
>;
//# sourceMappingURL=addGsiTenant.d.ts.map

import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
import type { BaseRecord } from "../../domain/transform/types/records.js";
/**
 * Transforms Security Groups to Roles
 * - Changes GROUP -> ROLE in keys and TYPE
 * - Changes GROUPS -> ROLES in GSI keys
 */
export declare const groupsToRoles: import("../../index.ts").Transformer.Interface<
  BaseTransformContext.Interface<BaseRecord>
>;
//# sourceMappingURL=groupsToRoles.d.ts.map

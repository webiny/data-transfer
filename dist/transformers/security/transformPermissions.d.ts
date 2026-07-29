import type { DdbCoreTransformContext } from "../../features/TransformContext/abstractions/contextAliases.js";
import type { BaseRecord } from "../../domain/transform/types/records.js";
/**
 * Transforms security role permissions to v6 format:
 * NOTE: This transformer expects wrapInData to run FIRST, so permissions is in data.permissions.
 * - Removes content.i18n permission
 * - Flattens cms.contentModel models from locale object to array
 * - Transforms cms.contentModelGroup groups from IDs to slugs
 */
export declare const transformPermissions: import("../../index.ts").Transformer.Interface<
  DdbCoreTransformContext.Interface<BaseRecord>
>;
//# sourceMappingURL=transformPermissions.d.ts.map

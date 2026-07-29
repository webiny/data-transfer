import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
import type { BaseRecord } from "../../domain/transform/types/records.js";
/**
 * Migrates File Manager settings from old format to KeyValue format.
 * NOTE: This transformer expects wrapInData to run FIRST, so the original data is in record.data.
 */
export declare const migrateFileManagerSettings: import("../../index.ts").Transformer.Interface<
  BaseTransformContext.Interface<BaseRecord>
>;
//# sourceMappingURL=migrateFileManagerSettings.d.ts.map

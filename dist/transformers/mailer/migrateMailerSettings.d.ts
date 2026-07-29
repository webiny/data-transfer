import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
import type { BaseRecord } from "../../domain/transform/types/records.js";
/**
 * Migrates Mailer settings from old format to KeyValue format.
 * NOTE: This transformer expects wrapInData to run FIRST, so values is in record.data.values.
 */
export declare const migrateMailerSettings: import("../../index.ts").Transformer.Interface<
  BaseTransformContext.Interface<BaseRecord>
>;
//# sourceMappingURL=migrateMailerSettings.d.ts.map

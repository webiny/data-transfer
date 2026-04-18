/**
 * Public API for config file authors.
 *
 * ```typescript
 * import { createDdbTransfer } from "@webiny/data-transfer";
 *
 * export default createDdbTransfer({ ... });
 * ```
 */
export { createDdbTransfer } from "./features/MigrationConfig/createDdbTransfer.ts";
export { createOsTransfer } from "./features/MigrationConfig/createOsTransfer.ts";
export { loadEnv } from "./utils/load-env.ts";

// Transformer factories
export { createTransformer } from "./transformers/createTransformer.ts";
export { createDdbTransformer } from "./transformers/createDdbTransformer.ts";
export { createOsTransformer } from "./transformers/createOsTransformer.ts";

// Built-in transformers (grouped exports)
export {
    wrapInData,
    addGsiTenant,
    removeLocale,
    removeAttributes
} from "./transformers/global/index.ts";
export {
    fixCmePk,
    fixBrokenStorageKeys,
    transformRichText,
    updateModelIds,
    removeFolderRevision,
    renameFieldAttributes,
    transformModelGroup
} from "./transformers/cms/index.ts";
export {
    createMetadata,
    extractImageMetadata,
    migrateFileManagerSettings
} from "./transformers/file-manager/index.ts";
export { updateFlpIds } from "./transformers/folders/index.ts";
export { migrateMailerSettings } from "./transformers/mailer/index.ts";
export {
    groupsToRoles,
    removeTenant,
    transformPermissions
} from "./transformers/security/index.ts";

// Pipeline factories
export { createPipeline, type PipelineDefinition } from "./domain/pipeline/createPipeline.ts";
export { createDdbPipeline } from "./domain/pipeline/createDdbPipeline.ts";
export { createOsPipeline } from "./domain/pipeline/createOsPipeline.ts";

// v5-to-v6 built-in pipeline definitions
export { cmsEntryPipeline } from "./presets/v5-to-v6/pipelines/cmsEntry.ts";
export { cmsModelPipeline } from "./presets/v5-to-v6/pipelines/cmsModel.ts";
export { fmFilePipeline } from "./presets/v5-to-v6/pipelines/fmFile.ts";

// Context types for user-written transformers
export type { BaseTransformContext } from "./features/TransformContext/abstractions/BaseTransformContext.ts";
export type { DdbTransformContext } from "./features/TransformContext/abstractions/DdbTransformContext.ts";
export type { OsTransformContext } from "./features/TransformContext/abstractions/OsTransformContext.ts";

// Transformer type shape for custom transformers
export type { Transformer } from "./domain/pipeline/abstractions/Transformer.ts";

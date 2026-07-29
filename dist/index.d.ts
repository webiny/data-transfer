/**
 * Public API for config file authors.
 *
 * ```typescript
 * import { createConfig } from "@webiny/data-transfer";
 *
 * export default createConfig({ ... });
 * ```
 */
export { createConfig } from "./features/MigrationConfig/createConfig.ts";
export { migrationConfigSchema } from "./features/MigrationConfig/validation.ts";
export type { MigrationConfiguration } from "./features/MigrationConfig/validation.ts";
export { loadEnv } from "./utils/load-env.ts";
export { fromEnv, numberFromEnv } from "./utils/fromEnv.ts";
export { initDataTransfer, type InitDataTransferContext } from "./utils/initDataTransfer.ts";
export { createTransferPreset } from "./utils/createTransferPreset.ts";
export { findPackageRoot } from "./utils/findPackageRoot.ts";
export {
  fromIni as fromAwsProfile,
  fromNodeProviderChain as fromAwsCredentialChain
} from "@aws-sdk/credential-providers";
export { createTransformer } from "./transformers/createTransformer.ts";
export { createDdbTransformer } from "./transformers/createDdbTransformer.ts";
export { createOsTransformer } from "./transformers/createOsTransformer.ts";
export { copyFileToTarget } from "./transformers/file-manager/copyFileToTarget.ts";
export { replaceFileUrls } from "./transformers/cms/replaceFileUrls.ts";
export { createFilter, type Filter } from "./domain/pipeline/Filter.ts";
export {
  byType,
  byTypePrefix,
  isCmsGroup,
  isCmsModel,
  isCmsEntry,
  byIncludesModelId,
  isAcoSearchRecord,
  isBackgroundTask,
  isFmFile,
  isFlpRecord,
  isBuiltInSecurityRole,
  isSecurityTeam,
  isOsBackgroundTask,
  isOsMailerSettings,
  isAuditLogEntry,
  isMigrationRecord,
  isFormBuilderRecord
} from "./domain/transform/filters.ts";
export { DdbScanner } from "./features/DdbScanner/index.ts";
export { DdbProcessor } from "./features/DdbProcessor/index.ts";
export { S3Processor } from "./features/S3Processor/index.ts";
export { AuditLogProcessor } from "./features/AuditLogProcessor/index.ts";
export { OsScanner } from "./features/OsScanner/index.ts";
export { OsProcessor } from "./features/OsProcessor/index.ts";
export { Processor } from "./domain/pipeline/abstractions/Processor.ts";
export {
  SourceDynamoDbClient,
  TargetDynamoDbClient
} from "./services/DynamoDbClient/abstractions/DynamoDbClient.ts";
export { OpenSearchClient } from "./services/OpenSearchClient/abstractions/OpenSearchClient.ts";
export { SourceS3Client, TargetS3Client } from "./services/S3Client/abstractions/S3Client.ts";
export { MigrationConfig } from "./features/MigrationConfig/abstractions/MigrationConfig.ts";
export type { MigrationPreset, PresetConfigureContext } from "./domain/transform/Preset.ts";
export type { BaseTransformContext } from "./features/TransformContext/abstractions/BaseTransformContext.ts";
export type {
  DdbCoreTransformContext,
  DdbTransformContext,
  OsTransformContext
} from "./features/TransformContext/abstractions/contextAliases.ts";
export type { Transformer } from "./domain/pipeline/abstractions/Transformer.ts";
export { IndexConfigurationProvider } from "./features/IndexConfigurationProvider/index.ts";
export { ModelProvider } from "./features/ModelProvider/index.ts";
export { BeforeTransferHook, AfterTransferHook } from "./features/TransferLifecycle/index.ts";
export { BeforeLoadPresetHook, AfterLoadPresetHook } from "./features/PresetLifecycle/index.ts";
export type { NonEmptyArray } from "./features/PipelineBuilderFactory/index.ts";
export { PipelineCustomizer } from "./features/PipelineCustomizer/index.ts";
//# sourceMappingURL=index.d.ts.map

/**
 * Public API for config file authors.
 *
 * ```typescript
 * import { createConfig } from "@webiny/data-transfer";
 *
 * export default createConfig({ ... });
 * ```
 */
export { createConfig } from "./features/MigrationConfig/createConfig.js";
export { migrationConfigSchema } from "./features/MigrationConfig/validation.js";
export { loadEnv } from "./utils/load-env.js";
export { fromEnv, numberFromEnv } from "./utils/fromEnv.js";
export { initDataTransfer } from "./utils/initDataTransfer.js";
export { createTransferPreset } from "./utils/createTransferPreset.js";
export { findPackageRoot } from "./utils/findPackageRoot.js";
// AWS credential providers — re-exported so users don't need a separate
// `@aws-sdk/credential-providers` dep.
//
// `fromAwsProfile` (= `fromIni`): explicit profile from ~/.aws/credentials.
// Use when you want a specific account named in code and don't want stray
// env vars to silently override it.
//
//     import { fromAwsProfile } from "@webiny/data-transfer";
//     credentials: fromAwsProfile({ profile: "prod-reader" })
//
// `fromAwsCredentialChain` (= `fromNodeProviderChain`): the AWS SDK's
// default credential resolution. Tries env vars → shared credentials file
// → SSO/web-identity → EC2/ECS IAM role. Pick when the same config has
// to run locally AND in CI / on a cloud box without code changes.
//
//     import { fromAwsCredentialChain } from "@webiny/data-transfer";
//     credentials: fromAwsCredentialChain()
export {
  fromIni as fromAwsProfile,
  fromNodeProviderChain as fromAwsCredentialChain
} from "@aws-sdk/credential-providers";
// Transformer factories
export { createTransformer } from "./transformers/createTransformer.js";
export { createDdbTransformer } from "./transformers/createDdbTransformer.js";
export { createOsTransformer } from "./transformers/createOsTransformer.js";
// Built-in transformers — ready-made for common patterns in custom presets.
export { copyFileToTarget } from "./transformers/file-manager/copyFileToTarget.js";
export { replaceFileUrls } from "./transformers/cms/replaceFileUrls.js";
// Pipeline factories
export { createFilter } from "./domain/pipeline/Filter.js";
// Built-in filter predicates — use with createFilter() or compose into custom filters.
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
} from "./domain/transform/filters.js";
// Scanner / processor implementation tokens — passed into
// `pipelineBuilderFactory.create({ scanner, processors: [...] })` when building a pipeline.
// Include every processor whose slice helpers your transformers reach for
// on ctx (DdbProcessor → putRecord; S3Processor → copyFile/getFile; etc.).
export { DdbScanner } from "./features/DdbScanner/index.js";
export { DdbProcessor } from "./features/DdbProcessor/index.js";
export { S3Processor } from "./features/S3Processor/index.js";
export { AuditLogProcessor } from "./features/AuditLogProcessor/index.js";
export { OsScanner } from "./features/OsScanner/index.js";
export { OsProcessor } from "./features/OsProcessor/index.js";
// Processor abstraction token — users reach for this when declaring custom
// processor impls (Processor.createImplementation({...})).
export { Processor } from "./domain/pipeline/abstractions/Processor.js";
// Service client abstractions — resolve via container for direct AWS access.
export {
  SourceDynamoDbClient,
  TargetDynamoDbClient
} from "./services/DynamoDbClient/abstractions/DynamoDbClient.js";
export { OpenSearchClient } from "./services/OpenSearchClient/abstractions/OpenSearchClient.js";
export { SourceS3Client, TargetS3Client } from "./services/S3Client/abstractions/S3Client.js";
// Resolved config — inject as a dependency to read table names, regions, credentials, etc.
export { MigrationConfig } from "./features/MigrationConfig/abstractions/MigrationConfig.js";
// IndexConfigurationProvider — override to customize OS index mappings/settings.
export { IndexConfigurationProvider } from "./features/IndexConfigurationProvider/index.js";
// ModelProvider — override to customize CMS model loading.
export { ModelProvider } from "./features/ModelProvider/index.js";
// Lifecycle hooks — register additional hooks via config.register.
// Hooks use { multiple: true } so registering adds to the list, not replaces.
export { BeforeTransferHook, AfterTransferHook } from "./features/TransferLifecycle/index.js";
export { BeforeLoadPresetHook, AfterLoadPresetHook } from "./features/PresetLifecycle/index.js";
// PipelineCustomizer — extend built-in preset pipelines from setup.ts.
export { PipelineCustomizer } from "./features/PipelineCustomizer/index.js";
//# sourceMappingURL=index.js.map

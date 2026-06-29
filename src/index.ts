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
export { createTransformer } from "./transformers/createTransformer.ts";
export { createDdbTransformer } from "./transformers/createDdbTransformer.ts";
export { createOsTransformer } from "./transformers/createOsTransformer.ts";

// Built-in transformers — ready-made for common patterns in custom presets.
export { copyFileToTarget } from "./transformers/file-manager/copyFileToTarget.ts";
export { replaceFileUrls } from "./transformers/cms/replaceFileUrls.ts";

// Pipeline factories
export { createFilter, type Filter } from "./domain/pipeline/Filter.ts";

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
} from "./domain/transform/filters.ts";

// Scanner / processor implementation tokens — passed into
// `pipelineBuilderFactory.create({ scanner, processors: [...] })` when building a pipeline.
// Include every processor whose slice helpers your transformers reach for
// on ctx (DdbProcessor → putRecord; S3Processor → copyFile/getFile; etc.).
export { DdbScanner } from "./features/DdbScanner/index.ts";
export { DdbProcessor } from "./features/DdbProcessor/index.ts";
export { S3Processor } from "./features/S3Processor/index.ts";
export { AuditLogProcessor } from "./features/AuditLogProcessor/index.ts";
export { OsScanner } from "./features/OsScanner/index.ts";
export { OsProcessor } from "./features/OsProcessor/index.ts";

// Processor abstraction token — users reach for this when declaring custom
// processor impls (Processor.createImplementation({...})).
export { Processor } from "./domain/pipeline/abstractions/Processor.ts";

// Service client abstractions — resolve via container for direct AWS access.
export {
    SourceDynamoDbClient,
    TargetDynamoDbClient
} from "./services/DynamoDbClient/abstractions/DynamoDbClient.ts";
export { OpenSearchClient } from "./services/OpenSearchClient/abstractions/OpenSearchClient.ts";
export { SourceS3Client, TargetS3Client } from "./services/S3Client/abstractions/S3Client.ts";

// Resolved config — inject as a dependency to read table names, regions, credentials, etc.
export { MigrationConfig } from "./features/MigrationConfig/abstractions/MigrationConfig.ts";

// MigrationPreset shape — users export an object of this type from their preset file.
// PresetConfigureContext is the arg bag passed into configure({runner, pipelineBuilderFactory, container}).
export type { MigrationPreset, PresetConfigureContext } from "./domain/transform/Preset.ts";

// Context types for user-written transformers.
export type { BaseTransformContext } from "./features/TransformContext/abstractions/BaseTransformContext.ts";
export type {
    DdbCoreTransformContext,
    DdbTransformContext,
    OsTransformContext
} from "./features/TransformContext/abstractions/contextAliases.ts";

// Transformer type shape for custom transformers.
export type { Transformer } from "./domain/pipeline/abstractions/Transformer.ts";

// IndexConfigurationProvider — override to customize OS index mappings/settings.
export { IndexConfigurationProvider } from "./features/IndexConfigurationProvider/index.ts";

// ModelProvider — override to customize CMS model loading.
export { ModelProvider } from "./features/ModelProvider/index.ts";

// Lifecycle hooks — register additional hooks via config.register.
// Hooks use { multiple: true } so registering adds to the list, not replaces.
export { BeforeTransferHook, AfterTransferHook } from "./features/TransferLifecycle/index.ts";
export { BeforeLoadPresetHook, AfterLoadPresetHook } from "./features/PresetLifecycle/index.ts";

// Pipeline-builder-factory helper type used when typing factory input
// (NonEmptyArray<...>).
export type { NonEmptyArray } from "./features/PipelineBuilderFactory/index.ts";

// PipelineCustomizer — extend built-in preset pipelines from setup.ts.
export { PipelineCustomizer } from "./features/PipelineCustomizer/index.ts";

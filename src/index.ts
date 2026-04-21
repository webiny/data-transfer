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
export { fromEnv, numberFromEnv } from "./utils/fromEnv.ts";
export { initDataTransfer, type InitDataTransferContext } from "./utils/initDataTransfer.ts";
export { createTransferPreset } from "./utils/createTransferPreset.ts";

// AWS credential provider — re-exported so users don't need a separate
// `@aws-sdk/credential-providers` dep. Named `fromAwsProfile` to avoid
// leaking the `ini` implementation detail that `fromIni` carries in the
// AWS SDK. Usage:
//
//     import { fromAwsProfile } from "@webiny/data-transfer";
//     ...
//     credentials: fromAwsProfile({ profile: "my-profile" })
//
// If no `profile` is given, falls back to the default profile
// (same behavior as setting AWS_PROFILE in the environment).
export { fromIni as fromAwsProfile } from "@aws-sdk/credential-providers";

// Transformer factories
export { createTransformer } from "./transformers/createTransformer.ts";
export { createDdbTransformer } from "./transformers/createDdbTransformer.ts";
export { createOsTransformer } from "./transformers/createOsTransformer.ts";

// Pipeline factories
export { createFilter, type Filter } from "./domain/pipeline/Filter.ts";

// Scanner / processor implementation tokens — passed into
// `pipelineBuilderFactory.create({ scanner, processors: [...] })` when building a pipeline.
// Include every processor whose slice helpers your transformers reach for
// on ctx (DdbProcessor → putRecord; S3Processor → copyFile/getFile; etc.).
export { DdbScanner } from "./features/DdbScanner/index.ts";
export { DdbProcessor } from "./features/DdbProcessor/index.ts";
export { S3Processor } from "./features/S3Processor/index.ts";
export { OsScanner } from "./features/OsScanner/index.ts";
export { OsProcessor } from "./features/OsProcessor/index.ts";

// Processor abstraction token — users reach for this when declaring custom
// processor impls (Processor.createImplementation({...})).
export { Processor } from "./domain/pipeline/abstractions/Processor.ts";

// MigrationPreset shape — users export an object of this type from their preset file.
// PresetConfigureContext is the arg bag passed into configure({runner, pipelineBuilderFactory, container}).
export type { MigrationPreset, PresetConfigureContext } from "./domain/transform/Preset.ts";

// Context types for user-written transformers.
export type { BaseTransformContext } from "./features/TransformContext/abstractions/BaseTransformContext.ts";
export type {
    DdbTransformContext,
    OsTransformContext
} from "./features/TransformContext/abstractions/contextAliases.ts";

// Transformer type shape for custom transformers.
export type { Transformer } from "./domain/pipeline/abstractions/Transformer.ts";

// Pipeline-builder-factory helper type used when typing factory input
// (NonEmptyArray<...>).
export type { NonEmptyArray } from "./features/PipelineBuilderFactory/index.ts";

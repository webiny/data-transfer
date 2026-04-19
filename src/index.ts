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

// Pipeline factories
export { createPipeline, type PipelineDefinition } from "./domain/pipeline/createPipeline.ts";
export { createDdbPipeline } from "./domain/pipeline/createDdbPipeline.ts";
export { createOsPipeline } from "./domain/pipeline/createOsPipeline.ts";
export { createFilter, type Filter } from "./domain/pipeline/Filter.ts";

// Scanner / processor implementation tokens — required when registering a
// pipeline definition with the runner: pipeline.register(runner, DdbScanner, DdbProcessor).
export { DdbScanner } from "./features/DdbScanner/index.ts";
export { DdbProcessor } from "./features/DdbProcessor/index.ts";
export { OsScanner } from "./features/OsScanner/index.ts";
export { OsProcessor } from "./features/OsProcessor/index.ts";

// MigrationPreset shape — users export an object of this type from their preset file.
export type { MigrationPreset } from "./domain/transform/Preset.ts";

// Context types for user-written transformers
export type { BaseTransformContext } from "./features/TransformContext/abstractions/BaseTransformContext.ts";
export type { DdbTransformContext } from "./features/TransformContext/abstractions/DdbTransformContext.ts";
export type { OsTransformContext } from "./features/TransformContext/abstractions/OsTransformContext.ts";

// Transformer type shape for custom transformers
export type { Transformer } from "./domain/pipeline/abstractions/Transformer.ts";

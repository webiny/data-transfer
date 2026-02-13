import { TransformPipeline, RecordFilter } from "./pipeline.ts";
import { Transformer } from "./transformer.ts";

// ============================================================================
// Pipeline Builder - General-Purpose Pipeline with Filters Only
// ============================================================================

/**
 * A flexible pipeline builder that provides filters without prescribing transformations.
 * Transformers are added by presets, allowing full customization of transformation logic.
 *
 * This separates the "what" (which records to process) from the "how" (what to do with them).
 */
export class PipelineBuilder<TInput extends Record<string, unknown> = Record<string, unknown>> {
  protected pipeline: TransformPipeline<TInput>;

  constructor() {
    this.pipeline = new TransformPipeline<TInput>();
  }

  /**
   * Add a filter to narrow down which records are processed.
   * Records must pass ALL filters to be processed.
   */
  filter(predicate: RecordFilter<TInput>): this {
    this.pipeline.filter(predicate);
    return this;
  }

  /**
   * Add a transformer to the pipeline.
   * Transformers are typically added by presets.
   */
  use<T>(transformer: Transformer<T>): this {
    this.pipeline.use(transformer);
    return this;
  }

  /**
   * Get the underlying TransformPipeline for registration with MigrationRunner.
   */
  build(): TransformPipeline<TInput> {
    return this.pipeline;
  }
}

// ============================================================================
// General-Purpose Pipeline Filters
// ============================================================================

/**
 * Filter for records by TYPE field
 */
export const byType = (type: string) => (record: Record<string, unknown>) => record.TYPE === type;

/**
 * Filter for records where TYPE starts with a prefix
 */
export const byTypePrefix = (prefix: string) => (record: Record<string, unknown>) => {
  const type = record.TYPE as string;
  return Boolean(type && type.startsWith(prefix));
};

/**
 * Filter for CMS models
 */
export const isCmsModel = byType("cms.model");

/**
 * Filter for CMS entries (all types)
 */
export const isCmsEntry = byTypePrefix("cms.entry");

/**
 * Filter for File Manager files (by modelId)
 */
export const isFmFile = (record: Record<string, unknown>) => {
  const modelId = record.modelId as string;
  return modelId === "fmFile" || modelId === "wbyFmFile";
};

/**
 * Filter for Folder Permissions records (PK contains "#FLP#")
 */
export const isFlpRecord = (record: Record<string, unknown>) => {
  return typeof record.PK === "string" && record.PK.includes("#FLP#");
};

/**
 * Filter for Security groups excluding built-in ones
 */
export const isBuiltInSecurityRole = (record: Record<string, unknown>) => {
  const slug = (record.slug || record.GSI1_SK) as string;
  return ["full-access", "anonymous"].includes(slug);
};

/**
 * Filter for Security teams
 */
export const isSecurityTeam = byType("security.team");

import { ModelProvider } from "../models/model-provider.ts";

// ============================================================================
// Configuration
// ============================================================================

export interface MigrationConfig {
  sourcePrimaryTable: string;
  targetPrimaryTable: string;
  sourceFmBucket: string;
  targetFmBucket: string;
  modelProvider: ModelProvider;
}

// ============================================================================
// Commands - represent deferred side effects
// ============================================================================

export interface PutRecordCommand {
  type: "PUT_RECORD";
  table: string;
  record: Record<string, unknown>;
}

export interface S3CopyCommand {
  type: "S3_COPY";
  sourceBucket: string;
  sourceKey: string;
  targetBucket: string;
  targetKey: string;
}

export type Command = PutRecordCommand | S3CopyCommand;

// ============================================================================
// Transform Context - passed through the pipeline
// ============================================================================

export interface TransformContext<TRecord = Record<string, unknown>> {
  /** Mutable working record - transformers modify this */
  record: TRecord;
  /** Original record (immutable) */
  readonly original: Readonly<TRecord>;
  /** Accumulated commands (internal use) */
  readonly commands: Command[];
  /** Model provider for accessing CMS models */
  readonly modelProvider: ModelProvider;
  /** Replace the working record entirely (for schema migrations) */
  replace<TNew>(newRecord: TNew): void;
  /** Put a record to the primary DynamoDB table */
  putPrimaryRecord(record: Record<string, unknown>): void;
  /** Put a record to the OpenSearch/Elasticsearch index (future) */
  putOsRecord(record: Record<string, unknown>): void;
  /** Copy a file from source to target location in S3 */
  copyFile(sourceKey: string, targetKey: string): void;
  /** Query a record from the source database */
  queryRecord(pk: string, sk?: string): Promise<Record<string, unknown> | null>;
  /** Execute a pipeline on multiple records and merge commands into parent context */
  executePipeline(pipeline: any, records: Record<string, unknown>[]): Promise<Command[]>;
}

// ============================================================================
// Pipeline Result
// ============================================================================

export interface PipelineResult {
  commands: Command[];
}

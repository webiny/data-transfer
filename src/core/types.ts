import { DatabaseClient } from "../database/interface.ts";
import { StorageClient } from "../storage/interface.ts";
import { ModelProvider } from "../models/model-provider.ts";
import { MigrationRunner } from "./runner.ts";

// ============================================================================
// Configuration
// ============================================================================

export interface MigrationConfig {
  sourcePrimaryTable: string;
  targetPrimaryTable: string;
  sourceFmBucket: string;
  targetFmBucket: string;
  modelProvider: ModelProvider;
  sourceStorage?: StorageClient;
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
  /** Get a file from the source S3 bucket. Returns null if no storage is configured. */
  getFile(key: string): Promise<Buffer | null>;
  /** Shared cache that persists across records within a migration run */
  readonly cache: Map<string, unknown>;
}

// ============================================================================
// Pipeline Result
// ============================================================================

export interface PipelineResult {
  commands: Command[];
}

/**
 * A migration preset defines a collection of transformation pipelines
 * that should be applied during migration.
 */
export interface MigrationPreset {
  /** Unique name for the preset */
  name: string;

  /** Human-readable description of what this preset does */
  description: string;

  /**
   * Configure the migration runner with pipelines.
   * This is where you register all the transformation pipelines
   * that should be applied for this preset.
   */
  configure(runner: MigrationRunner, config: MigrationConfig, database: DatabaseClient): void;
}

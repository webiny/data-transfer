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
  /** Accumulated commands */
  readonly commands: Command[];
  /** Emit a side-effect command */
  emit(command: Command): void;
  /** Replace the working record entirely (for schema migrations) */
  replace<TNew>(newRecord: TNew): void;
  /** Emit an additional record (not the primary one) */
  putRecord(record: Record<string, unknown>, table?: string): void;
}

// ============================================================================
// Pipeline Result
// ============================================================================

export interface PipelineResult {
  commands: Command[];
}

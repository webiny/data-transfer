import { Transformer } from "./transformer.ts";
import { MigrationConfig, PipelineResult } from "./types.ts";
import { createContext } from "./context.ts";
import { DatabaseClient } from "../database/interface.ts";

// ============================================================================
// Record Filter
// ============================================================================

export type RecordFilter<T = Record<string, unknown>> = (record: T) => boolean;

// ============================================================================
// Pipeline
// ============================================================================

export class TransformPipeline<TInput extends Record<string, unknown>> {
  private transformers: Transformer<any>[] = [];
  private filters: RecordFilter<TInput>[] = [];

  /** Add a filter - record must pass ALL filters to be processed */
  filter(predicate: RecordFilter<TInput>): this {
    this.filters.push(predicate);
    return this;
  }

  use<T>(transformer: Transformer<T>): this {
    this.transformers.push(transformer);
    return this;
  }

  /** Check if a record should be processed */
  accepts(record: TInput): boolean {
    return this.filters.every(f => f(record));
  }

  async run(
    record: TInput,
    config: MigrationConfig,
    database: DatabaseClient
  ): Promise<PipelineResult | null> {
    // Skip records that don't pass filters
    if (!this.accepts(record)) {
      return null;
    }

    const ctx = createContext(record, config, database);

    for (const transformer of this.transformers) {
      await transformer.transform(ctx);
    }

    ctx.putPrimaryRecord(ctx.record);

    return { commands: ctx.commands };
  }
}

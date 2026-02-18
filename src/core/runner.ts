import { TransformPipeline } from "./pipeline.ts";
import { Command, MigrationConfig } from "./types.ts";
import { DatabaseClient } from "../database/interface.ts";

// ============================================================================
// Migration Runner
// ============================================================================

export class MigrationRunner {
  private pipelines: TransformPipeline<any>[] = [];
  private config: MigrationConfig;
  private database: DatabaseClient;
  readonly cache = new Map<string, unknown>();

  constructor(config: MigrationConfig, database: DatabaseClient) {
    this.config = config;
    this.database = database;
  }

  register(pipeline: TransformPipeline<any>): this {
    this.pipelines.push(pipeline);
    return this;
  }

  async processRecord(record: Record<string, unknown>): Promise<Command[]> {
    for (const pipeline of this.pipelines) {
      if (pipeline.accepts(record)) {
        const result = await pipeline.run(record, this.config, this.database, this.cache);
        return result ? result.commands : [];
      }
    }

    // No pipeline matched - record will be skipped
    return [];
  }

  async processAll(records: Record<string, unknown>[]): Promise<Command[]> {
    const allCommands: Command[] = [];

    for (const record of records) {
      const commands = await this.processRecord(record);
      allCommands.push(...commands);
    }

    return allCommands;
  }
}

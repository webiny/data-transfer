import { TransformPipeline } from "./pipeline.ts";
import { Command } from "./types.ts";

// ============================================================================
// Migration Runner
// ============================================================================

export class MigrationRunner {
  private pipelines: TransformPipeline<any>[] = [];

  register(pipeline: TransformPipeline<any>): this {
    this.pipelines.push(pipeline);
    return this;
  }

  async processRecord(record: Record<string, unknown>): Promise<Command[]> {
    for (const pipeline of this.pipelines) {
      if (pipeline.accepts(record)) {
        const result = await pipeline.run(record);
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

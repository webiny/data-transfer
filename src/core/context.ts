import { Command, MigrationConfig, TransformContext } from "./types.ts";
import { DatabaseClient } from "../database/interface.ts";

export function createContext<T extends Record<string, unknown>>(
  record: T,
  config: MigrationConfig,
  database: DatabaseClient
): TransformContext<T> {
  const commands: Command[] = [];

  const ctx: TransformContext<any> = {
    record: structuredClone(record),
    original: Object.freeze(structuredClone(record)),
    commands,
    replace(newRecord) {
      ctx.record = newRecord;
    },
    putPrimaryRecord(record: Record<string, unknown>) {
      commands.push({
        type: "PUT_RECORD",
        table: config.targetPrimaryTable,
        record
      });
    },
    putOsRecord(record: Record<string, unknown>) {
      // Future implementation for OpenSearch/Elasticsearch
      // For now, we can throw or use a placeholder table name
      throw new Error("OpenSearch/Elasticsearch support not yet implemented");
    },
    copyFile(sourceKey: string, targetKey: string) {
      commands.push({
        type: "S3_COPY",
        sourceBucket: config.sourceFmBucket,
        sourceKey,
        targetBucket: config.targetFmBucket,
        targetKey
      });
    },
    async queryRecord(pk: string, sk?: string) {
      const results = await database.query(config.sourcePrimaryTable, pk, sk);
      return results.length > 0 ? results[0] : null;
    }
  };

  return ctx;
}

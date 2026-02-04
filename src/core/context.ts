import { Command, MigrationConfig, TransformContext } from "./types.ts";

export function createContext<T extends Record<string, unknown>>(
  record: T,
  config: MigrationConfig
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
    }
  };

  return ctx;
}

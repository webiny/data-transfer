import { Command } from "./types.ts";
import { DatabaseClient } from "../database/interface.ts";
import { StorageClient } from "../storage/interface.ts";

// ============================================================================
// Command Executor
// ============================================================================

export interface ExecutorDependencies {
  database: DatabaseClient;
  storage: StorageClient;
}

export async function executeCommands(
  commands: Command[],
  deps: ExecutorDependencies
): Promise<void> {
  if (commands.length === 0) return;

  // Separate commands by type
  const putCommands: Array<{
    table: string;
    record: Record<string, unknown>;
  }> = [];
  const s3CopyCommands: Array<{
    sourceBucket: string;
    sourceKey: string;
    targetBucket: string;
    targetKey: string;
  }> = [];

  for (const command of commands) {
    switch (command.type) {
      case "PUT_RECORD":
        putCommands.push({
          table: command.table,
          record: command.record
        });
        break;
      case "S3_COPY":
        s3CopyCommands.push({
          sourceBucket: command.sourceBucket,
          sourceKey: command.sourceKey,
          targetBucket: command.targetBucket,
          targetKey: command.targetKey
        });
        break;
    }
  }

  // Group PUT commands by table and execute in batches
  const recordsByTable = new Map<string, Array<Record<string, unknown>>>();
  for (const { table, record } of putCommands) {
    if (!recordsByTable.has(table)) {
      recordsByTable.set(table, []);
    }
    recordsByTable.get(table)!.push(record);
  }

  // Execute all PUT commands
  const putPromises = Array.from(recordsByTable.entries()).map(([table, records]) =>
    deps.database.batchPut(table, records as any[])
  );

  // Execute all S3 copy commands
  const copyPromise =
    s3CopyCommands.length > 0 ? deps.storage.batchCopy(s3CopyCommands) : Promise.resolve();

  // Wait for all operations to complete
  await Promise.all([...putPromises, copyPromise]);
}

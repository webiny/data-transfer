import { describe, it, expect, beforeEach } from "vitest";
import { createTestRunner } from "../src/utils/test-helpers.ts";
import { executeCommands } from "../src/core/executor.ts";
import { MigrationConfig } from "../src/core/types.ts";
import { ModelProvider } from "../src/models/model-provider.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";
import { MockStorageClient } from "./mocks/storage-client.ts";
import { v5FolderRecord } from "./fixtures/v5-records.ts";

describe("Folder Records", () => {
  let database: MockDatabaseClient;
  let storage: MockStorageClient;
  let config: MigrationConfig;
  let modelProvider: ModelProvider;

  beforeEach(() => {
    database = new MockDatabaseClient();
    storage = new MockStorageClient();
    modelProvider = new ModelProvider(database, "source-table");
    config = {
      sourcePrimaryTable: "source-table",
      targetPrimaryTable: "target-table",
      sourceFmBucket: "source-bucket",
      targetFmBucket: "target-bucket",
      modelProvider
    };
  });

  it("should remove #0001 from folder IDs", async () => {
    const runner = createTestRunner(config, database);

    const commands = await runner.processRecord(v5FolderRecord);
    await executeCommands(commands, { database, storage });

    const migratedRecords = database.batchPutRecords;
    expect(migratedRecords).toHaveLength(1);

    const migratedRecord = migratedRecords[0];

    // Should remove #0001 from ids (data is wrapped, so original data becomes data.data)
    expect(migratedRecord.data.id).toBe("folder123");
    expect(migratedRecord.data.parentId).toBe("root");
    expect(migratedRecord.data.id).not.toContain("#0001");
    expect(migratedRecord.data.parentId).not.toContain("#0001");
  });
});

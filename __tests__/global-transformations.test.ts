import { describe, it, expect, beforeEach } from "vitest";
import { createTestRunner } from "../src/utils/test-helpers.ts";
import { executeCommands } from "../src/core/executor.ts";
import { MigrationConfig } from "../src/core/types.ts";
import { ModelProvider } from "../src/models/model-provider.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";
import { MockStorageClient } from "./mocks/storage-client.ts";
import { v5SecurityGroup } from "./fixtures/v5-records.ts";

describe("Global Transformations", () => {
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

  it("should wrap non-reserved attributes in data envelope", async () => {
    const runner = createTestRunner(config, database);

    const commands = await runner.processRecord(v5SecurityGroup);
    await executeCommands(commands, { database, storage });

    const migratedRecords = database.batchPutRecords;
    const migratedRecord = migratedRecords[0];

    // Reserved attributes should be at top level
    expect(migratedRecord.PK).toBeDefined();
    expect(migratedRecord.SK).toBeDefined();
    expect(migratedRecord.TYPE).toBeDefined();
    expect(migratedRecord.GSI_TENANT).toBeDefined();

    // Non-reserved attributes should be in data
    expect(migratedRecord.name).toBeUndefined();
    expect(migratedRecord.permissions).toBeUndefined();
    expect(migratedRecord.slug).toBeUndefined();

    // Should be in data instead
    expect(migratedRecord.data.name).toBe("Test Role #1");
    expect(migratedRecord.data.permissions).toBeDefined();
    expect(migratedRecord.data.slug).toBe("test-role-1");
  });

  it("should add GSI_TENANT attribute", async () => {
    const runner = createTestRunner(config, database);

    const commands = await runner.processRecord(v5SecurityGroup);
    await executeCommands(commands, { database, storage });

    const migratedRecords = database.batchPutRecords;
    const migratedRecord = migratedRecords[0];

    expect(migratedRecord.GSI_TENANT).toBe("root");
  });

  it("should remove locale from all keys", async () => {
    const runner = createTestRunner(config, database);

    const commands = await runner.processRecord(v5SecurityGroup);
    await executeCommands(commands, { database, storage });

    const migratedRecords = database.batchPutRecords;
    const migratedRecord = migratedRecords[0];

    // No keys should contain locale pattern
    expect(migratedRecord.PK).not.toContain("#L#en-US#");
    expect(migratedRecord.GSI1_PK).not.toContain("#L#en-US#");
  });

  it("should remove webinyVersion attribute", async () => {
    const runner = createTestRunner(config, database);

    const commands = await runner.processRecord(v5SecurityGroup);
    await executeCommands(commands, { database, storage });

    const migratedRecords = database.batchPutRecords;
    const migratedRecord = migratedRecords[0];

    expect(migratedRecord.webinyVersion).toBeUndefined();
    expect(migratedRecord.data.webinyVersion).toBeUndefined();
  });
});

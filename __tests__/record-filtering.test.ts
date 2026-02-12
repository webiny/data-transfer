import { describe, it, expect, beforeEach } from "vitest";
import { createTestRunner } from "../src/utils/test-helpers.ts";
import { MigrationConfig } from "../src/core/types.ts";
import { ModelProvider } from "../src/models/model-provider.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";
import { MockStorageClient } from "./mocks/storage-client.ts";
import { v5UnknownRecord } from "./fixtures/v5-records.ts";

describe("Record Filtering", () => {
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

  it("should skip records without matching pipeline", async () => {
    const runner = createTestRunner(config, database);

    const commands = await runner.processRecord(v5UnknownRecord);

    // Should return empty commands array (record skipped)
    expect(commands).toHaveLength(0);
  });
});

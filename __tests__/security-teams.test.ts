import { describe, it, expect, beforeEach } from "vitest";
import { createTestRunner } from "../src/utils/test-helpers.ts";
import { executeCommands } from "../src/core/executor.ts";
import { MigrationConfig } from "../src/core/types.ts";
import { ModelProvider } from "../src/models/model-provider.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";
import { MockStorageClient } from "./mocks/storage-client.ts";
import { v5SecurityTeam } from "./fixtures/v5-records.ts";

describe("Security Teams", () => {
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

  it("should transform security.team records", async () => {
    const runner = createTestRunner(config, database);

    const commands = await runner.processRecord(v5SecurityTeam);
    await executeCommands(commands, { database, storage });

    const migratedRecords = database.batchPutRecords;
    expect(migratedRecords).toHaveLength(1);

    const migratedRecord = migratedRecords[0];

    // Should keep TYPE unchanged
    expect(migratedRecord.TYPE).toBe("security.team");

    // Should keep _et unchanged
    expect(migratedRecord._et).toBe("SecurityTeam");

    // Should NOT have locale in keys (teams don't have locale)
    expect(migratedRecord.PK).toBe("T#root#TEAM#6983017e5119180002ccf5eb");
    expect(migratedRecord.GSI1_PK).toBe("T#root#TEAMS");

    // Should add GSI_TENANT
    expect(migratedRecord.GSI_TENANT).toBe("root");

    // Should wrap in data envelope
    expect(migratedRecord.data).toBeDefined();
    expect(migratedRecord.data.name).toBe("Team #1");
    expect(migratedRecord.data.groups).toEqual(["67af50f9ac973600020bb054"]);

    // Should remove webinyVersion attribute (global removal)
    expect(migratedRecord.webinyVersion).toBeUndefined();
    expect(migratedRecord.data.webinyVersion).toBeUndefined();
  });
});

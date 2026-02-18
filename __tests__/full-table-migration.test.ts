import { describe, it, expect, beforeAll } from "vitest";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { createTestRunner } from "../src/utils/test-helpers.ts";
import { executeCommands } from "../src/core/executor.ts";
import { MigrationConfig } from "../src/core/types.ts";
import { ModelProvider } from "../src/models/model-provider.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";
import { MockStorageClient } from "./mocks/storage-client.ts";

describe("Full Table Migration", () => {
  let inputRecords: Record<string, unknown>[];

  beforeAll(async () => {
    const raw = await readFile(join(__dirname, "fixtures/full-table.json"), "utf-8");
    inputRecords = JSON.parse(raw);
  });

  it("should migrate the full dynamo table", async () => {
    const database = new MockDatabaseClient({
      "source-table": inputRecords as any[]
    });
    const storage = new MockStorageClient();
    const modelProvider = new ModelProvider(database, "source-table");

    const config: MigrationConfig = {
      sourcePrimaryTable: "source-table",
      targetPrimaryTable: "target-table",
      sourceFmBucket: "source-bucket",
      targetFmBucket: "target-bucket",
      modelProvider
    };

    // Preload models from the table itself
    await modelProvider.preloadModels(new Map([["root", "en-US"]]));

    const runner = createTestRunner(config, database);
    const commands = await runner.processAll(inputRecords);
    await executeCommands(commands, { database, storage });

    const migratedRecords = database.batchPutRecords;

    // Write migrated output
    const outputPath = join(__dirname, "fixtures/full-table-migrated.json");
    await writeFile(outputPath, JSON.stringify(migratedRecords, null, 2));

    // Basic sanity checks
    expect(migratedRecords.length).toBeGreaterThan(0);

    // Every migrated record should have a TYPE
    for (const record of migratedRecords) {
      expect(record.TYPE).toBeDefined();
    }

    // No migrated record should have webinyVersion at root
    for (const record of migratedRecords) {
      expect(record.webinyVersion).toBeUndefined();
    }

    // All CMS entries should have GSI_TENANT
    const cmsEntries = migratedRecords.filter(
      r => typeof r.TYPE === "string" && (r.TYPE as string).startsWith("cms.entry")
    );
    for (const entry of cmsEntries) {
      expect(entry.GSI_TENANT).toBeDefined();
    }

    // No CMS entry PK should contain locale segment
    for (const entry of cmsEntries) {
      expect(entry.PK).not.toContain("#L#en-US#");
    }

    // All CMS entries should be wrapped in data envelope
    for (const entry of cmsEntries) {
      expect(entry.data).toBeDefined();
      expect(entry.data.values).toBeDefined();
    }

    console.log(
      `Migrated ${migratedRecords.length} records from ${inputRecords.length} input records`
    );
    console.log(`Output written to ${outputPath}`);
  });
});

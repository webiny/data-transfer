import { describe, it, expect, beforeEach } from "vitest";
import { createTestRunner } from "../src/utils/test-helpers.ts";
import { executeCommands } from "../src/core/executor.ts";
import { MigrationConfig } from "../src/core/types.ts";
import { ModelProvider } from "../src/models/model-provider.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";
import { MockStorageClient } from "./mocks/storage-client.ts";
import { v5SecurityGroup, v5FileManagerSettings, v5MailerSettings } from "./fixtures/v5-records.ts";

describe("Batch Processing", () => {
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

    it("should process multiple records", async () => {
        const runner = createTestRunner(config, database);

        const records = [v5SecurityGroup, v5FileManagerSettings, v5MailerSettings];

        const commands = await runner.processAll(records);
        await executeCommands(commands, { database, storage });

        const migratedRecords = database.batchPutRecords;

        // Should have migrated all 3 records
        expect(migratedRecords.length).toBeGreaterThanOrEqual(3);

        // Check that different types were processed
        const types = migratedRecords.map(r => r.TYPE);
        expect(types).toContain("security.role");
        expect(types).toContain("KeyValueStore");
    });
});

import { describe, it, expect, beforeEach } from "vitest";
import { createTestRunner } from "../src/utils/test-helpers.ts";
import { executeCommands } from "../src/core/executor.ts";
import { MigrationConfig } from "../src/core/types.ts";
import { ModelProvider } from "../src/models/model-provider.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";
import { MockStorageClient } from "./mocks/storage-client.ts";
import { v5FileManagerSettings } from "./fixtures/v5-records.ts";

describe("File Manager Settings", () => {
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

    it("should migrate FM settings to KeyValue format", async () => {
        const runner = createTestRunner(config, database);

        const commands = await runner.processRecord(v5FileManagerSettings);
        await executeCommands(commands, { database, storage });

        const migratedRecords = database.batchPutRecords;
        expect(migratedRecords).toHaveLength(1);

        const migratedRecord = migratedRecords[0];

        // Should change to KeyValue format
        expect(migratedRecord.PK).toBe("KV#root:FileManager/General");
        expect(migratedRecord.SK).toBe("A");
        expect(migratedRecord.TYPE).toBe("KeyValueStore");
        expect(migratedRecord._et).toBe("KeyValueStore");

        // Should have proper data structure
        expect(migratedRecord.data.key).toBe("FileManager/General");
        expect(migratedRecord.data.scope).toBe("root");
        expect(migratedRecord.data.value).toBeDefined();
        expect(migratedRecord.data.value.srcPrefix).toBe(
            "https://d8eqa02y4s7ns.cloudfront.net/files/"
        );
        expect(migratedRecord.data.value.uploadMaxFileSize).toBe(10737418240);

        // Should not have tenant in value
        expect(migratedRecord.data.value.tenant).toBeUndefined();

        // Should add GSI_TENANT
        expect(migratedRecord.GSI_TENANT).toBe("root");
    });
});

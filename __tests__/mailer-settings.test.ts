import { describe, it, expect, beforeEach } from "vitest";
import { createTestRunner } from "../src/utils/test-helpers.ts";
import { executeCommands } from "../src/core/executor.ts";
import { MigrationConfig } from "../src/core/types.ts";
import { ModelProvider } from "../src/models/model-provider.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";
import { MockStorageClient } from "./mocks/storage-client.ts";
import { v5MailerSettings } from "./fixtures/v5-records.ts";

describe("Mailer Settings", () => {
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

    it("should migrate mailer settings to KeyValue format", async () => {
        const runner = createTestRunner(config, database);

        const commands = await runner.processRecord(v5MailerSettings);
        await executeCommands(commands, { database, storage });

        const migratedRecords = database.batchPutRecords;
        expect(migratedRecords).toHaveLength(1);

        const migratedRecord = migratedRecords[0];

        // Should change to KeyValue format
        expect(migratedRecord.PK).toBe("KV#root:Mailer/Settings/Transport");
        expect(migratedRecord.SK).toBe("A");
        expect(migratedRecord.TYPE).toBe("KeyValueStore");

        // Should have proper data structure
        expect(migratedRecord.data.key).toBe("Mailer/Settings/Transport");
        expect(migratedRecord.data.scope).toBe("root");
        expect(migratedRecord.data.value).toBeDefined();
        expect(migratedRecord.data.value.from).toBe("noreply@hostname.com");
        expect(migratedRecord.data.value.host).toBe("hostname.com");
        expect(migratedRecord.data.value.password).toBe(
            "U2FsdGVkX1/6k2xNUKb2oeQD+570saZOZyYGKpo+0PI="
        );
    });
});

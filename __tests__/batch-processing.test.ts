import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";
import {
    v5SecurityGroup,
    v5FileManagerSettings,
    v5MailerSettings,
    v5ContentModelGroup
} from "./fixtures/v5-records.ts";

describe("Batch Processing", () => {
    it("should process multiple records", async () => {
        const container = createDdbContainer({
            sourceRecords: {
                "source-table": [
                    v5ContentModelGroup as BaseRecord,
                    v5SecurityGroup as BaseRecord,
                    v5FileManagerSettings as BaseRecord,
                    v5MailerSettings as BaseRecord
                ]
            }
        });
        const runner = container.resolve(PipelineRunner);
        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        v5ToV6Preset.configure(runner);

        await runner.run();

        const migratedRecords = targetDb.batchPutRecords;
        expect(migratedRecords.length).toBeGreaterThanOrEqual(3);

        const types = migratedRecords.map(r => (r as BaseRecord).TYPE);
        expect(types).toContain("security.role");
        expect(types).toContain("KeyValueStore");
    });
});

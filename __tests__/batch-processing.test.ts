import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbCommandExecutor } from "~/features/DdbCommandExecutor/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
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
            sourceRecords: { "source-table": [v5ContentModelGroup as any] }
        });
        const runner = container.resolve(PipelineRunner);
        const executor = container.resolve(DdbCommandExecutor);
        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        v5ToV6Preset.configure(runner);

        const records = [v5SecurityGroup, v5FileManagerSettings, v5MailerSettings] as any[];

        const commands = await runner.processAll(records);
        await executor.execute(commands);

        const migratedRecords = targetDb.batchPutRecords;
        expect(migratedRecords.length).toBeGreaterThanOrEqual(3);

        const types = migratedRecords.map((r: any) => r.TYPE);
        expect(types).toContain("security.role");
        expect(types).toContain("KeyValueStore");
    });
});

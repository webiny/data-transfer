import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbCommandExecutor } from "~/features/DdbCommandExecutor/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";
import { v5FolderRecord } from "./fixtures/v5-records.ts";

describe("Folder Records", () => {
    it("should remove #0001 from folder IDs", async () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        const executor = container.resolve(DdbCommandExecutor);
        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;

        v5ToV6Preset.configure(runner);

        const commands = await runner.processRecord(v5FolderRecord as any);
        await executor.execute(commands);

        const migratedRecords = targetDb.batchPutRecords;
        expect(migratedRecords).toHaveLength(1);

        const migratedRecord = migratedRecords[0] as any;

        expect(migratedRecord.data.id).toBe("folder123");
        expect(migratedRecord.data.parentId).toBe("root");
        expect(migratedRecord.data.id).not.toContain("#0001");
        expect(migratedRecord.data.parentId).not.toContain("#0001");
    });
});

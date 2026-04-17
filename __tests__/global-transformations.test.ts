import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbCommandExecutor } from "~/features/DdbCommandExecutor/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";
import { v5SecurityGroup, v5ContentModelGroup } from "./fixtures/v5-records.ts";

function setup() {
    const container = createDdbContainer({
        sourceRecords: { "source-table": [v5ContentModelGroup as any] }
    });
    const runner = container.resolve(PipelineRunner);
    const executor = container.resolve(DdbCommandExecutor);
    const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
    v5ToV6Preset.configure(runner);
    return { runner, executor, targetDb };
}

describe("Global Transformations", () => {
    it("should wrap non-reserved attributes in data envelope", async () => {
        const { runner, executor, targetDb } = setup();
        const commands = await runner.processRecord(v5SecurityGroup as any);
        await executor.execute(commands);

        const migratedRecord = targetDb.batchPutRecords[0] as any;

        expect(migratedRecord.PK).toBeDefined();
        expect(migratedRecord.SK).toBeDefined();
        expect(migratedRecord.TYPE).toBeDefined();
        expect(migratedRecord.GSI_TENANT).toBeDefined();

        expect(migratedRecord.name).toBeUndefined();
        expect(migratedRecord.permissions).toBeUndefined();
        expect(migratedRecord.slug).toBeUndefined();

        expect(migratedRecord.data.name).toBe("Test Role #1");
        expect(migratedRecord.data.permissions).toBeDefined();
        expect(migratedRecord.data.slug).toBe("test-role-1");
    });

    it("should add GSI_TENANT attribute", async () => {
        const { runner, executor, targetDb } = setup();
        const commands = await runner.processRecord(v5SecurityGroup as any);
        await executor.execute(commands);

        expect((targetDb.batchPutRecords[0] as any).GSI_TENANT).toBe("root");
    });

    it("should remove locale from all keys", async () => {
        const { runner, executor, targetDb } = setup();
        const commands = await runner.processRecord(v5SecurityGroup as any);
        await executor.execute(commands);

        const migratedRecord = targetDb.batchPutRecords[0] as any;
        expect(migratedRecord.PK).not.toContain("#L#en-US#");
        expect(migratedRecord.GSI1_PK).not.toContain("#L#en-US#");
    });

    it("should remove webinyVersion attribute", async () => {
        const { runner, executor, targetDb } = setup();
        const commands = await runner.processRecord(v5SecurityGroup as any);
        await executor.execute(commands);

        const migratedRecord = targetDb.batchPutRecords[0] as any;
        expect(migratedRecord.webinyVersion).toBeUndefined();
        expect(migratedRecord.data.webinyVersion).toBeUndefined();
    });
});

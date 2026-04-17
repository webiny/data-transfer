import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbCommandExecutor } from "~/features/DdbCommandExecutor/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";
import { v5SecurityTeam } from "./fixtures/v5-records.ts";

describe("Security Teams", () => {
    it("should transform security.team records", async () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        const executor = container.resolve(DdbCommandExecutor);
        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;

        v5ToV6Preset.configure(runner);

        const commands = await runner.processRecord(v5SecurityTeam as any);
        await executor.execute(commands);

        const migratedRecords = targetDb.batchPutRecords;
        expect(migratedRecords).toHaveLength(1);

        const migratedRecord = migratedRecords[0] as any;

        expect(migratedRecord.TYPE).toBe("security.team");
        expect(migratedRecord._et).toBe("SecurityTeam");
        expect(migratedRecord.PK).toBe("T#root#TEAM#6983017e5119180002ccf5eb");
        expect(migratedRecord.GSI1_PK).toBe("T#root#TEAMS");
        expect(migratedRecord.GSI_TENANT).toBe("root");
        expect(migratedRecord.data).toBeDefined();
        expect(migratedRecord.data.name).toBe("Team #1");
        expect(migratedRecord.data.groups).toEqual(["67af50f9ac973600020bb054"]);
        expect(migratedRecord.webinyVersion).toBeUndefined();
        expect(migratedRecord.data.webinyVersion).toBeUndefined();
    });
});

import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbCommandExecutor } from "~/features/DdbCommandExecutor/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";
import { v5FileManagerSettings } from "./fixtures/v5-records.ts";

describe("File Manager Settings", () => {
    it("should migrate FM settings to KeyValue format", async () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        const executor = container.resolve(DdbCommandExecutor);
        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;

        v5ToV6Preset.configure(runner);

        const commands = await runner.processRecord(v5FileManagerSettings as any);
        await executor.execute(commands);

        const migratedRecords = targetDb.batchPutRecords;
        expect(migratedRecords).toHaveLength(1);

        const migratedRecord = migratedRecords[0] as any;

        expect(migratedRecord.PK).toBe("KV#root:FileManager/General");
        expect(migratedRecord.SK).toBe("A");
        expect(migratedRecord.TYPE).toBe("KeyValueStore");
        expect(migratedRecord._et).toBe("KeyValueStore");

        expect(migratedRecord.data.key).toBe("FileManager/General");
        expect(migratedRecord.data.scope).toBe("root");
        expect(migratedRecord.data.value).toBeDefined();
        expect(migratedRecord.data.value.srcPrefix).toBe(
            "https://d8eqa02y4s7ns.cloudfront.net/files/"
        );
        expect(migratedRecord.data.value.uploadMaxFileSize).toBe(10737418240);

        expect(migratedRecord.data.value.tenant).toBeUndefined();

        expect(migratedRecord.GSI_TENANT).toBe("root");
    });
});

import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbCommandExecutor } from "~/features/DdbCommandExecutor/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";
import { v5MailerSettings } from "./fixtures/v5-records.ts";

describe("Mailer Settings", () => {
    it("should migrate mailer settings to KeyValue format", async () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        const executor = container.resolve(DdbCommandExecutor);
        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;

        v5ToV6Preset.configure(runner);

        const commands = await runner.processRecord(v5MailerSettings as any);
        await executor.execute(commands);

        const migratedRecords = targetDb.batchPutRecords;
        expect(migratedRecords).toHaveLength(1);

        const migratedRecord = migratedRecords[0] as any;

        expect(migratedRecord.PK).toBe("KV#root:Mailer/Settings/Transport");
        expect(migratedRecord.SK).toBe("A");
        expect(migratedRecord.TYPE).toBe("KeyValueStore");

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

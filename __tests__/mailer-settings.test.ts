import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";
import { v5MailerSettings } from "./fixtures/v5-records.ts";

interface MailerSettingsValue {
    from?: string;
    host?: string;
    password?: string;
    [key: string]: unknown;
}

interface MigratedMailerSettings extends BaseRecord {
    data: {
        key?: string;
        scope?: string;
        value?: MailerSettingsValue;
    };
}

describe("Mailer Settings", () => {
    it("should migrate mailer settings to KeyValue format", async () => {
        const container = createDdbContainer({
            sourceRecords: { "source-table": [v5MailerSettings as BaseRecord] }
        });
        const runner = container.resolve(PipelineRunner);
        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        v5ToV6Preset.configure(runner);

        await runner.run();

        const migratedRecords = targetDb.batchPutRecords;
        expect(migratedRecords).toHaveLength(1);

        const migratedRecord = migratedRecords[0] as MigratedMailerSettings;

        expect(migratedRecord.PK).toBe("KV#root:Mailer/Settings/Transport");
        expect(migratedRecord.SK).toBe("A");
        expect(migratedRecord.TYPE).toBe("KeyValueStore");

        expect(migratedRecord.data.key).toBe("Mailer/Settings/Transport");
        expect(migratedRecord.data.scope).toBe("root");
        expect(migratedRecord.data.value).toBeDefined();
        const value = migratedRecord.data.value as MailerSettingsValue;
        expect(value.from).toBe("noreply@hostname.com");
        expect(value.host).toBe("hostname.com");
        expect(value.password).toBe("U2FsdGVkX1/6k2xNUKb2oeQD+570saZOZyYGKpo+0PI=");
    });
});

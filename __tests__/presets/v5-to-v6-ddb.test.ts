import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { MockDynamoDbClient } from "../services/DynamoDbClient/MockDynamoDbClient.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";

interface Fixture {
    record: BaseRecord;
    expectsWrite: boolean;
}

const fixtures: Fixture[] = [
    {
        record: {
            PK: "T#root#FM#S",
            SK: "L",
            TYPE: "fm.settings",
            _et: "FmSettings",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z"
        } as BaseRecord,
        expectsWrite: true
    },
    {
        record: {
            PK: "T#root#L#en-US#CMS#CME#file-1",
            SK: "REV#0001",
            TYPE: "cms.entry",
            modelId: "fmFile",
            _et: "CmsEntries",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z"
        } as BaseRecord,
        expectsWrite: true
    },
    {
        record: {
            PK: "T#root#MAILER#S",
            SK: "L",
            TYPE: "mailer.settings",
            modelId: "mailerSettings",
            _et: "MailerSettings",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z"
        } as BaseRecord,
        expectsWrite: true
    },
    {
        record: {
            PK: "T#root#GROUP#my-group",
            SK: "A",
            TYPE: "security.group",
            slug: "my-group",
            _et: "SecurityGroup",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z",
            data: { permissions: [] }
        } as BaseRecord,
        expectsWrite: true
    },
    {
        record: {
            PK: "T#root#TEAM#my-team",
            SK: "A",
            TYPE: "security.team",
            _et: "SecurityTeam",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z"
        } as BaseRecord,
        expectsWrite: true
    },
    {
        record: {
            PK: "T#root#CMS#MODEL#myModel",
            SK: "A",
            TYPE: "cms.model",
            _et: "CmsModel",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z"
        } as BaseRecord,
        expectsWrite: true
    },
    {
        record: {
            PK: "T#root#FLP#abc",
            SK: "A",
            TYPE: "flp",
            _et: "Flp",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z",
            data: { id: "abc#0001", parentId: "" }
        } as BaseRecord,
        expectsWrite: true
    },
    {
        record: {
            PK: "T#root#L#en-US#CMS#CME#entry-1",
            SK: "REV#0001",
            TYPE: "cms.entry",
            modelId: "someModel",
            _et: "CmsEntries",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z"
        } as BaseRecord,
        expectsWrite: true
    }
];

describe("v5ToV6Preset (DDB) — round-trip", () => {
    it("registers all 8 pipelines and writes one record per branch", async () => {
        const container = createDdbContainer({
            sourceRecords: { "source-table": fixtures.map(f => f.record) }
        });
        const runner = container.resolve(PipelineRunner);

        v5ToV6Preset.configure(runner);

        await runner.run();

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        const expectedWrites = fixtures.filter(f => f.expectsWrite).length;
        expect(targetDb.batchPutRecords.length).toBe(expectedWrites);
    });
});

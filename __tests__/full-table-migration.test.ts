import { describe, it, expect, beforeAll } from "vitest";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { ModelProvider } from "~/features/ModelProvider/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";

interface MigratedRecord extends BaseRecord {
    GSI_TENANT?: string;
    webinyVersion?: string;
    data?: {
        values?: Record<string, unknown>;
        [key: string]: unknown;
    };
}

describe("Full Table Migration", () => {
    let inputRecords: BaseRecord[];

    beforeAll(async () => {
        const raw = await readFile(join(__dirname, "fixtures/full-table.json"), "utf-8");
        inputRecords = JSON.parse(raw) as BaseRecord[];
    });

    it("should migrate the full dynamo table", async () => {
        const container = createDdbContainer({
            sourceRecords: { "source-table": inputRecords }
        });
        const runner = container.resolve(PipelineRunner);
        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        const modelProvider = container.resolve(ModelProvider);

        await modelProvider.preloadModels(new Map([["root", "en-US"]]));
        v5ToV6Preset.configure(runner);

        await runner.run();

        const migratedRecords = targetDb.batchPutRecords as MigratedRecord[];

        const outputPath = join(__dirname, "fixtures/full-table-migrated.json");
        await writeFile(outputPath, JSON.stringify(migratedRecords, null, 2));

        expect(migratedRecords.length).toBeGreaterThan(0);

        for (const record of migratedRecords) {
            expect(record.TYPE).toBeDefined();
            expect(record.webinyVersion).toBeUndefined();
        }

        const cmsEntries = migratedRecords.filter(
            r => typeof r.TYPE === "string" && r.TYPE.startsWith("cms.entry")
        );
        for (const entry of cmsEntries) {
            expect(entry.GSI_TENANT).toBeDefined();
            expect(entry.PK).not.toContain("#L#en-US#");
            expect(entry.data).toBeDefined();
            expect(entry.data?.values).toBeDefined();
        }
    });
});

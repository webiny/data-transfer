import { describe, it, expect, beforeAll } from "vitest";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbCommandExecutor } from "~/features/DdbCommandExecutor/index.ts";
import { ModelProvider } from "~/features/ModelProvider/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";

describe("Full Table Migration", () => {
    let inputRecords: Record<string, unknown>[];

    beforeAll(async () => {
        const raw = await readFile(join(__dirname, "fixtures/full-table.json"), "utf-8");
        inputRecords = JSON.parse(raw);
    });

    it("should migrate the full dynamo table", async () => {
        const container = createDdbContainer({
            sourceRecords: { "source-table": inputRecords as any[] }
        });
        const runner = container.resolve(PipelineRunner);
        const executor = container.resolve(DdbCommandExecutor);
        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        const modelProvider = container.resolve(ModelProvider);

        await modelProvider.preloadModels(new Map([["root", "en-US"]]));
        v5ToV6Preset.configure(runner);

        const commands = await runner.processAll(inputRecords as any);
        await executor.execute(commands);

        const migratedRecords = targetDb.batchPutRecords;

        const outputPath = join(__dirname, "fixtures/full-table-migrated.json");
        await writeFile(outputPath, JSON.stringify(migratedRecords, null, 2));

        expect(migratedRecords.length).toBeGreaterThan(0);

        for (const record of migratedRecords as any[]) {
            expect(record.TYPE).toBeDefined();
            expect(record.webinyVersion).toBeUndefined();
        }

        const cmsEntries = (migratedRecords as any[]).filter(
            r => typeof r.TYPE === "string" && (r.TYPE as string).startsWith("cms.entry")
        );
        for (const entry of cmsEntries) {
            expect(entry.GSI_TENANT).toBeDefined();
            expect(entry.PK).not.toContain("#L#en-US#");
            expect(entry.data).toBeDefined();
            expect(entry.data.values).toBeDefined();
        }

        console.log(
            `Migrated ${migratedRecords.length} records from ${inputRecords.length} input records`
        );
    });
});

import { describe, it, expect } from "vitest";
import { createOsContainer } from "../containers/index.ts";
import { generateOsRecords } from "../utils/os-record-mocker.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { v5ToV6OsPreset } from "~/presets/v5-to-v6-os.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { OpenSearchClient } from "~/services/OpenSearchClient/abstractions/OpenSearchClient.ts";
import { GzipCompression } from "~/tools/GzipCompression/abstractions/GzipCompression.ts";
import { MockDynamoDbClient } from "../services/DynamoDbClient/MockDynamoDbClient.ts";
import { MockOpenSearchClient } from "../services/OpenSearchClient/MockOpenSearchClient.ts";
import type { SourceDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";

interface OsTargetRecord {
    PK: string;
    SK: string;
    data: GzipCompression.Compressed;
    index: string;
    TYPE: string;
    GSI_TENANT: unknown;
    _et: string;
    _ct: string;
    _md: string;
}

interface OsInnerData {
    modelId: string;
    entryId: string;
    locale?: string;
    [key: string]: unknown;
}

describe("OS migration integration (end-to-end through v5ToV6OsPreset + generated records)", () => {
    it("writes gzipped target records whose payload round-trips through gzip.decompress", async () => {
        const sourceRecords = await generateOsRecords({ entries: 3 });
        const container = createOsContainer({
            sourceRecords: {
                "source-os": sourceRecords as unknown as SourceDynamoDbClient.Record[]
            }
        });
        const runner = container.resolve(PipelineRunner);
        v5ToV6OsPreset.configure(runner);

        await runner.run();

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        const gzip = container.resolve(GzipCompression);
        const written = targetDb.batchPutRecords as unknown as OsTargetRecord[];

        expect(written.length).toBe(6);

        for (const record of written) {
            expect(record.data.compression).toBe("gzip");
            expect(typeof record.data.value).toBe("string");
            const inner = await gzip.decompress<OsInnerData>(record.data);
            expect(inner).not.toBeNull();
        }
    });

    it("creates one OS index per distinct model id with the locale stripped", async () => {
        const sourceRecords = await generateOsRecords({
            entries: 2,
            modelIds: ["category", "article"]
        });
        const container = createOsContainer({
            sourceRecords: {
                "source-os": sourceRecords as unknown as SourceDynamoDbClient.Record[]
            }
        });
        const runner = container.resolve(PipelineRunner);
        v5ToV6OsPreset.configure(runner);

        await runner.run();

        const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;
        const indexes = await osClient.listIndexes();
        const indexNames = indexes.map(i => i.index);

        expect(indexNames).toContain("root-headless-cms-category");
        expect(indexNames).toContain("root-headless-cms-article");
    });

    it("produces inner OS documents that keep modelId/entryId but drop the locale field", async () => {
        const sourceRecords = await generateOsRecords({
            entries: 2,
            modelIds: ["category", "article"]
        });
        const container = createOsContainer({
            sourceRecords: {
                "source-os": sourceRecords as unknown as SourceDynamoDbClient.Record[]
            }
        });
        const runner = container.resolve(PipelineRunner);
        v5ToV6OsPreset.configure(runner);

        await runner.run();

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        const gzip = container.resolve(GzipCompression);
        const written = targetDb.batchPutRecords as unknown as OsTargetRecord[];

        expect(written.length).toBeGreaterThan(0);

        for (const record of written) {
            const inner = await gzip.decompress<OsInnerData>(record.data);
            expect(inner).not.toBeNull();
            expect(inner!.modelId).toBeDefined();
            expect(inner!.entryId).toBeDefined();
            expect(inner!.locale).toBeUndefined();
        }
    });
});

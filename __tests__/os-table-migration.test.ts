import { describe, it, expect } from "vitest";
import { createOsContainer } from "./containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { v5ToV6OsPreset } from "~/presets/v5-to-v6-os.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";
import { OpenSearchClient } from "~/services/OpenSearchClient/abstractions/OpenSearchClient.ts";
import { MockOpenSearchClient } from "./services/OpenSearchClient/MockOpenSearchClient.ts";
import { table } from "./fixtures/es-table.ts";
import type { SourceDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";

interface OsTargetRecord {
    PK: string;
    SK: string;
    data: unknown;
    index: string;
    TYPE: string;
    GSI_TENANT: unknown;
    _et: string;
    _ct: string;
    _md: string;
}

describe("OS table migration (end-to-end through v5ToV6OsPreset)", () => {
    it("decompresses, transforms, and writes CMS-entry OS records with locale stripped", async () => {
        const container = createOsContainer({
            sourceRecords: { "source-os": table as unknown as SourceDynamoDbClient.Record[] }
        });
        const runner = container.resolve(PipelineRunner);
        v5ToV6OsPreset.configure(runner);

        await runner.run();

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;

        // The fixture has 5 CmsEntriesElasticsearch records + 2 PbPagesEs records
        // (the decompressor drops non-CMS entries). All 5 should round-trip.
        const written = targetDb.batchPutRecords as unknown as OsTargetRecord[];
        expect(written.length).toBe(5);

        for (const record of written) {
            expect(record.PK).toBeDefined();
            expect(record.SK).toBeDefined();
            expect(record.GSI_TENANT).toBeDefined();
            expect(record._et).toBe("CmsEntriesElasticsearch");
            expect(record._ct).toBeDefined();
            expect(record._md).toBeDefined();
            expect(record.index).toBeDefined();
            // Locale stripped from the target index name
            expect(record.index).not.toContain("en-us");
            // Locale stripped from PK
            expect(record.PK).not.toContain("#L#en-US#");
        }

        // Target indexes must have been created on the OS client side (locale stripped).
        expect(osClient.getIndexCount()).toBeGreaterThan(0);
    });
});

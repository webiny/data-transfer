import { describe, it, expect } from "vitest";
import { CompressionHandler } from "@webiny/utils/exports/api.js";
import { createOsContainer } from "../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.js";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.js";
import { createFilter } from "~/domain/pipeline/index.js";
import { isCmsEntry } from "~/domain/transform/filters.js";
import { OsScanner } from "~/features/OsScanner/index.js";
import { OsProcessor } from "~/features/OsProcessor/index.js";
import { addLiveField } from "~/transformers/cms/addLiveField.js";
import {
    SourceDynamoDbClient,
    TargetDynamoDbClient
} from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";

const PK = "T#root#L#en-US#CMS#CME#draft-over-published";
const INDEX = "root-headless-cms-en-us-blogpost";

describe("v5-to-v6-os lane — addLiveField on a draft-over-published entry", () => {
    it("writes live: { version: 2 } on both L and P documents", async () => {
        const container = createOsContainer();
        const compression = container.resolve(CompressionHandler);
        const sourceDb = container.resolve(SourceDynamoDbClient) as MockDynamoDbClient;
        const now = "2024-01-01T00:00:00.000Z";
        await sourceDb.batchPut("source-os", [
            {
                PK,
                SK: "L",
                index: INDEX,
                data: await compression.compress({
                    modelId: "blogPost",
                    entryId: "x",
                    version: 3,
                    status: "draft"
                }),
                _ct: now,
                _et: "CmsEntriesElasticsearch",
                _md: now
            },
            {
                PK,
                SK: "P",
                index: INDEX,
                data: await compression.compress({
                    modelId: "blogPost",
                    entryId: "x",
                    version: 2,
                    status: "published"
                }),
                _ct: now,
                _et: "CmsEntriesElasticsearch",
                _md: now
            }
        ]);

        const runner = container.resolve(PipelineRunner);
        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "CmsEntries",
            scanner: OsScanner,
            processors: [OsProcessor]
        });
        builder.filter(createFilter(isCmsEntry)).use(addLiveField);
        runner.register(await builder.build());
        await runner.run();

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        const written = targetDb.batchPutRecords;
        expect(written).toHaveLength(2);
        const bySk = new Map(written.map(r => [r.SK, r]));
        const latest = await compression.decompress<Record<string, unknown>>(bySk.get("L")!.data);
        const published = await compression.decompress<Record<string, unknown>>(
            bySk.get("P")!.data
        );
        expect(latest.live).toEqual({ version: 2 });
        expect(published.live).toEqual({ version: 2 });
    });
});

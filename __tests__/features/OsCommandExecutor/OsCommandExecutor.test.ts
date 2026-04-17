import { describe, it, expect } from "vitest";
import { OsCommandExecutor } from "~/features/OsCommandExecutor/index.ts";
import { TargetDynamoDbClient } from "~/features/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { OpenSearchClient } from "~/features/OpenSearchClient/abstractions/OpenSearchClient.ts";
import { createOsContainer } from "../../containers/index.ts";
import { MockDynamoDbClient } from "../DynamoDbClient/MockDynamoDbClient.ts";
import { MockOpenSearchClient } from "../OpenSearchClient/MockOpenSearchClient.ts";

function makeItem(overrides: Partial<OsCommandExecutor.Item> = {}): OsCommandExecutor.Item {
    return {
        record: {
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            _et: "CmsEntries",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z",
            TYPE: "cms.entry.l",
            GSI_TENANT: "root",
            data: { modelId: "article", values: { "text@title": "Hello" } }
        },
        metadata: {
            index: "root-headless-cms-en-us-article",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z"
        },
        locale: "en-US",
        ...overrides
    };
}

describe("OsCommandExecutor", () => {
    describe("DI registration", () => {
        it("should resolve from os container", () => {
            const container = createOsContainer();
            const executor = container.resolve(OsCommandExecutor);
            expect(executor).toBeDefined();
            expect(typeof executor.execute).toBe("function");
        });

        it("should return same instance on multiple resolves", () => {
            const container = createOsContainer();
            expect(container.resolve(OsCommandExecutor)).toBe(container.resolve(OsCommandExecutor));
        });
    });

    describe("execute", () => {
        it("should be a no-op for empty items", async () => {
            const container = createOsContainer();
            const executor = container.resolve(OsCommandExecutor);
            const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;

            await executor.execute([], new Map());

            expect(targetDb.batchPutRecords).toHaveLength(0);
        });

        it("should batchPut an OS record with compressed data and stripped index", async () => {
            const container = createOsContainer();
            const executor = container.resolve(OsCommandExecutor);
            const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;

            const touchedIndexes = new Map<string, string>();
            await executor.execute([makeItem()], touchedIndexes);

            expect(targetDb.batchPutRecords).toHaveLength(1);
            const written = targetDb.batchPutRecords[0];
            expect(written.PK).toBe("T#root#CMS#CME#abc");
            expect(written.SK).toBe("L");
            expect(written.index).toBe("root-headless-cms-article"); // locale stripped
            expect(written._et).toBe("CmsEntriesElasticsearch");
            // data is gzipped
            expect(written.data).toHaveProperty("compression");
            expect(written.data).toHaveProperty("value");

            // index was created
            expect(await osClient.indexExists("root-headless-cms-article")).toBe(true);
            // touchedIndexes tracked
            expect(touchedIndexes.has("root-headless-cms-article")).toBe(true);
        });

        it("should create missing indexes before writing", async () => {
            const container = createOsContainer();
            const executor = container.resolve(OsCommandExecutor);
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;

            expect(await osClient.indexExists("root-headless-cms-article")).toBe(false);

            await executor.execute([makeItem()], new Map());

            expect(await osClient.indexExists("root-headless-cms-article")).toBe(true);
        });

        it("should store '1s' in touchedIndexes for newly-created indexes", async () => {
            const container = createOsContainer();
            const executor = container.resolve(OsCommandExecutor);

            const touchedIndexes = new Map<string, string>();
            await executor.execute([makeItem()], touchedIndexes);

            expect(touchedIndexes.get("root-headless-cms-article")).toBe("1s");
        });

        it("should store original refresh_interval when index already exists", async () => {
            const container = createOsContainer();
            const executor = container.resolve(OsCommandExecutor);
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;

            // Pre-create index with refresh_interval "5s"
            await osClient.createIndex("root-headless-cms-article");
            await osClient.putIndexSettings("root-headless-cms-article", {
                index: { refresh_interval: "5s" }
            });

            const touchedIndexes = new Map<string, string>();
            await executor.execute([makeItem()], touchedIndexes);

            // Executor reads settings before disabling refresh, so original "5s" is captured
            expect(touchedIndexes.get("root-headless-cms-article")).toBe("5s");
        });

        it("should skip ensureIndex for indexes already in touchedIndexes", async () => {
            const container = createOsContainer();
            const executor = container.resolve(OsCommandExecutor);
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;

            const touchedIndexes = new Map<string, string>();
            touchedIndexes.set("root-headless-cms-article", "2s");

            await executor.execute([makeItem()], touchedIndexes);

            // Index was never created because it was already "touched"
            expect(await osClient.indexExists("root-headless-cms-article")).toBe(false);
            // Touched value unchanged
            expect(touchedIndexes.get("root-headless-cms-article")).toBe("2s");
        });

        it("should dedupe index ensure across items with same target index", async () => {
            const container = createOsContainer();
            const executor = container.resolve(OsCommandExecutor);
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;

            const item1 = makeItem();
            const item2 = makeItem({
                record: { ...makeItem().record, PK: "T#root#CMS#CME#def" }
            });

            await executor.execute([item1, item2], new Map());

            // Only one index created even though two items targeted it
            expect(osClient.getIndexCount()).toBe(1);
        });
    });
});

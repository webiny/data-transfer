import { describe, it, expect } from "vitest";
import { OsCommandExecutor } from "~/features/OsCommandExecutor/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { OpenSearchClient } from "~/services/OpenSearchClient/abstractions/OpenSearchClient.ts";
import type { OsRecord } from "~/features/OsScanner/abstractions/OsScanner.ts";
import { createOsContainer } from "../../containers/index.ts";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";
import { MockOpenSearchClient } from "../../services/OpenSearchClient/MockOpenSearchClient.ts";

function makeRecord(overrides: Partial<OsRecord> = {}): OsRecord {
    return {
        PK: "T#root#CMS#CME#abc",
        SK: "L",
        _et: "CmsEntriesElasticsearch",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: "cms.entry.l",
        GSI_TENANT: "root",
        index: "root-headless-cms-article",
        data: { modelId: "article", values: { "text@title": "Hello" } },
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
        it("should be a no-op for empty records", async () => {
            const container = createOsContainer();
            const executor = container.resolve(OsCommandExecutor);
            const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;

            await executor.execute([], new Map());

            expect(targetDb.batchPutRecords).toHaveLength(0);
        });

        it("writes a target record whose envelope mirrors the input and whose data is gzipped", async () => {
            const container = createOsContainer();
            const executor = container.resolve(OsCommandExecutor);
            const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;

            const touchedIndexes = new Map<string, string>();
            await executor.execute([makeRecord()], touchedIndexes);

            expect(targetDb.batchPutRecords).toHaveLength(1);
            const written = targetDb.batchPutRecords[0];
            expect(written.PK).toBe("T#root#CMS#CME#abc");
            expect(written.SK).toBe("L");
            expect(written.index).toBe("root-headless-cms-article");
            expect(written._et).toBe("CmsEntriesElasticsearch");
            expect(written.data).toHaveProperty("compression");
            expect(written.data).toHaveProperty("value");

            expect(await osClient.indexExists("root-headless-cms-article")).toBe(true);
            expect(touchedIndexes.has("root-headless-cms-article")).toBe(true);
        });

        it("creates missing indexes before writing", async () => {
            const container = createOsContainer();
            const executor = container.resolve(OsCommandExecutor);
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;

            expect(await osClient.indexExists("root-headless-cms-article")).toBe(false);

            await executor.execute([makeRecord()], new Map());

            expect(await osClient.indexExists("root-headless-cms-article")).toBe(true);
        });

        it("stores '1s' in touchedIndexes for newly-created indexes", async () => {
            const container = createOsContainer();
            const executor = container.resolve(OsCommandExecutor);

            const touchedIndexes = new Map<string, string>();
            await executor.execute([makeRecord()], touchedIndexes);

            expect(touchedIndexes.get("root-headless-cms-article")).toBe("1s");
        });

        it("stores original refresh_interval when index already exists", async () => {
            const container = createOsContainer();
            const executor = container.resolve(OsCommandExecutor);
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;

            await osClient.createIndex("root-headless-cms-article");
            await osClient.putIndexSettings("root-headless-cms-article", {
                index: { refresh_interval: "5s" }
            });

            const touchedIndexes = new Map<string, string>();
            await executor.execute([makeRecord()], touchedIndexes);

            expect(touchedIndexes.get("root-headless-cms-article")).toBe("5s");
        });

        it("skips ensureIndex for indexes already in touchedIndexes", async () => {
            const container = createOsContainer();
            const executor = container.resolve(OsCommandExecutor);
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;

            const touchedIndexes = new Map<string, string>();
            touchedIndexes.set("root-headless-cms-article", "2s");

            await executor.execute([makeRecord()], touchedIndexes);

            expect(await osClient.indexExists("root-headless-cms-article")).toBe(false);
            expect(touchedIndexes.get("root-headless-cms-article")).toBe("2s");
        });

        it("dedupes index creation across records targeting the same index", async () => {
            const container = createOsContainer();
            const executor = container.resolve(OsCommandExecutor);
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;

            const r1 = makeRecord();
            const r2 = makeRecord({ PK: "T#root#CMS#CME#def" });

            await executor.execute([r1, r2], new Map());

            expect(osClient.getIndexCount()).toBe(1);
        });
    });
});

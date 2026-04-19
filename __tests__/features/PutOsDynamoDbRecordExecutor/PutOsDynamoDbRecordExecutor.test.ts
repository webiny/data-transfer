import { describe, expect, it, vi } from "vitest";
import { PutOsDynamoDbRecordExecutor } from "~/features/PutOsDynamoDbRecordExecutor/abstractions/PutOsDynamoDbRecordExecutor.ts";
import { PutDynamoDbRecordExecutor } from "~/features/PutDynamoDbRecordExecutor/abstractions/PutDynamoDbRecordExecutor.ts";
import { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";
import { OpenSearchClient } from "~/services/OpenSearchClient/abstractions/OpenSearchClient.ts";
import { GzipCompression } from "~/tools/GzipCompression/abstractions/GzipCompression.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { createOsContainer } from "../../containers/index.ts";
import { MockOpenSearchClient } from "../../services/OpenSearchClient/MockOpenSearchClient.ts";

interface RecordOverrides {
    PK?: string;
    index?: string;
    data?: Record<string, unknown>;
}

interface OsTuningShape {
    gzipConcurrency?: number;
}

interface MutableConfigCast {
    tuning?: { os?: OsTuningShape };
}

const TABLE = "target-os";
const INDEX = "root-headless-cms-article";

function makePut(overrides: RecordOverrides = {}): PutRecord {
    return PutRecord.create({
        table: TABLE,
        record: {
            PK: overrides.PK ?? "T#root#CMS#CME#abc",
            SK: "L",
            _et: "CmsEntriesElasticsearch",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z",
            TYPE: "cms.entry.l",
            GSI_TENANT: "root",
            index: overrides.index ?? INDEX,
            data: overrides.data ?? { modelId: "article", values: { "text@title": "Hello" } }
        }
    });
}

describe("PutOsDynamoDbRecordExecutor", () => {
    describe("DI registration", () => {
        it("resolves from os container", () => {
            const container = createOsContainer();
            const executor = container.resolve(PutOsDynamoDbRecordExecutor);
            expect(executor).toBeDefined();
            expect(typeof executor.execute).toBe("function");
        });

        it("is a singleton", () => {
            const container = createOsContainer();
            expect(container.resolve(PutOsDynamoDbRecordExecutor)).toBe(
                container.resolve(PutOsDynamoDbRecordExecutor)
            );
        });
    });

    describe("execute", () => {
        it("is a no-op for an empty array (no OS calls, no delegate call)", async () => {
            const container = createOsContainer();
            const executor = container.resolve(PutOsDynamoDbRecordExecutor);
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;
            const delegate = container.resolve(PutDynamoDbRecordExecutor);

            const osExistsSpy = vi.spyOn(osClient, "indexExists");
            const osCreateSpy = vi.spyOn(osClient, "createIndex");
            const delegateSpy = vi.spyOn(delegate, "execute");

            await executor.execute([]);

            expect(osExistsSpy).not.toHaveBeenCalled();
            expect(osCreateSpy).not.toHaveBeenCalled();
            expect(delegateSpy).not.toHaveBeenCalled();
        });

        it("gzips record.data and delegates the put to PutDynamoDbRecordExecutor", async () => {
            const container = createOsContainer();
            const executor = container.resolve(PutOsDynamoDbRecordExecutor);
            const delegate = container.resolve(PutDynamoDbRecordExecutor);

            const delegateSpy = vi.spyOn(delegate, "execute").mockResolvedValue();

            await executor.execute([makePut()]);

            expect(delegateSpy).toHaveBeenCalledTimes(1);
            const receivedPuts = delegateSpy.mock.calls[0][0];
            expect(receivedPuts).toHaveLength(1);
            const received = receivedPuts[0];
            expect(received).toBeInstanceOf(PutRecord);
            expect(received.table).toBe(TABLE);
            expect(received.record.PK).toBe("T#root#CMS#CME#abc");
            expect(received.record.index).toBe(INDEX);

            const compressed = received.record.data as { compression: string; value: string };
            expect(compressed).toHaveProperty("compression");
            expect(compressed).toHaveProperty("value");
            expect(typeof compressed.value).toBe("string");
        });

        it("records originalRefresh from existing index settings in TouchedIndexes", async () => {
            const container = createOsContainer();
            const executor = container.resolve(PutOsDynamoDbRecordExecutor);
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;
            const touched = container.resolve(TouchedIndexes);

            await osClient.createIndex(INDEX);
            await osClient.putIndexSettings(INDEX, {
                index: { refresh_interval: "5s" }
            });

            const existsSpy = vi.spyOn(osClient, "indexExists");
            const getSettingsSpy = vi.spyOn(osClient, "getIndexSettings");
            const putSettingsSpy = vi.spyOn(osClient, "putIndexSettings");

            await executor.execute([makePut()]);

            expect(existsSpy).toHaveBeenCalledWith(INDEX);
            expect(getSettingsSpy).toHaveBeenCalledWith(INDEX);
            expect(putSettingsSpy).toHaveBeenCalled();
            expect(touched.all()).toEqual([{ indexName: INDEX, originalRefresh: "5s" }]);
        });

        it("records '1s' in TouchedIndexes for newly-created indexes and does not call getIndexSettings", async () => {
            const container = createOsContainer();
            const executor = container.resolve(PutOsDynamoDbRecordExecutor);
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;
            const touched = container.resolve(TouchedIndexes);

            const getSettingsSpy = vi.spyOn(osClient, "getIndexSettings");
            const createSpy = vi.spyOn(osClient, "createIndex");

            await executor.execute([makePut()]);

            expect(createSpy).toHaveBeenCalledTimes(1);
            expect(createSpy).toHaveBeenCalledWith(
                INDEX,
                expect.objectContaining({
                    settings: { index: { refresh_interval: "-1" } }
                })
            );
            expect(getSettingsSpy).not.toHaveBeenCalled();
            expect(touched.all()).toEqual([{ indexName: INDEX, originalRefresh: "1s" }]);
        });

        it("swallows putIndexSettings failure and still records originalRefresh", async () => {
            const container = createOsContainer();
            const executor = container.resolve(PutOsDynamoDbRecordExecutor);
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;
            const touched = container.resolve(TouchedIndexes);

            await osClient.createIndex(INDEX);
            await osClient.putIndexSettings(INDEX, { index: { refresh_interval: "3s" } });

            const putSpy = vi
                .spyOn(osClient, "putIndexSettings")
                .mockRejectedValueOnce(new Error("settings-update failed"));

            await expect(executor.execute([makePut()])).resolves.toBeUndefined();

            expect(putSpy).toHaveBeenCalled();
            expect(touched.all()).toEqual([{ indexName: INDEX, originalRefresh: "3s" }]);
        });

        it("skips ensureIndex when the index is already recorded in TouchedIndexes", async () => {
            const container = createOsContainer();
            const executor = container.resolve(PutOsDynamoDbRecordExecutor);
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;
            const touched = container.resolve(TouchedIndexes);

            touched.record(INDEX, "2s");

            const existsSpy = vi.spyOn(osClient, "indexExists");
            const createSpy = vi.spyOn(osClient, "createIndex");
            const getSettingsSpy = vi.spyOn(osClient, "getIndexSettings");

            await executor.execute([makePut()]);

            expect(existsSpy).not.toHaveBeenCalled();
            expect(createSpy).not.toHaveBeenCalled();
            expect(getSettingsSpy).not.toHaveBeenCalled();
            expect(touched.all()).toEqual([{ indexName: INDEX, originalRefresh: "2s" }]);
        });

        it("caps concurrent gzip.compress calls at tuning.os.gzipConcurrency", async () => {
            const container = createOsContainer();
            const config = container.resolve(MigrationConfig) as MigrationConfig.Interface &
                MutableConfigCast;
            config.tuning = { ...(config.tuning ?? {}), os: { gzipConcurrency: 2 } };

            const executor = container.resolve(PutOsDynamoDbRecordExecutor);
            const gzip = container.resolve(GzipCompression);
            const delegate = container.resolve(PutDynamoDbRecordExecutor);

            vi.spyOn(delegate, "execute").mockResolvedValue();

            let inFlight = 0;
            let peak = 0;
            const original = gzip.compress.bind(gzip);
            vi.spyOn(gzip, "compress").mockImplementation(async payload => {
                inFlight++;
                if (inFlight > peak) {
                    peak = inFlight;
                }
                await new Promise(resolve => setTimeout(resolve, 0));
                const result = await original(payload);
                inFlight--;
                return result;
            });

            const puts = Array.from({ length: 8 }, (_, i) =>
                makePut({ PK: `T#root#CMS#CME#${i}` })
            );
            await executor.execute(puts);

            expect(peak).toBeLessThanOrEqual(2);
            expect(peak).toBeGreaterThan(0);
        });

        it("calls ensureIndex once per unique index across many records", async () => {
            const container = createOsContainer();
            const executor = container.resolve(PutOsDynamoDbRecordExecutor);
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;
            const touched = container.resolve(TouchedIndexes);

            const createSpy = vi.spyOn(osClient, "createIndex");

            const puts: PutRecord[] = [
                makePut({ PK: "T#root#CMS#CME#a", index: "idx-a" }),
                makePut({ PK: "T#root#CMS#CME#b", index: "idx-a" }),
                makePut({ PK: "T#root#CMS#CME#c", index: "idx-b" }),
                makePut({ PK: "T#root#CMS#CME#d", index: "idx-b" })
            ];

            await executor.execute(puts);

            expect(createSpy).toHaveBeenCalledTimes(2);
            expect(createSpy).toHaveBeenCalledWith("idx-a", expect.anything());
            expect(createSpy).toHaveBeenCalledWith("idx-b", expect.anything());
            expect(
                touched
                    .all()
                    .map(i => i.indexName)
                    .sort()
            ).toEqual(["idx-a", "idx-b"]);
        });
    });
});

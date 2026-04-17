import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { setup, startDb, stopDb, createTables, deleteTables } from "jest-dynalite";
import { Client } from "@opensearch-project/opensearch";
import { Container } from "@webiny/di";
import { generateOsRecords } from "../utils/os-record-mocker.ts";
import { MigrationConfig, MigrationConfigFeature } from "~/features/MigrationConfig/index.ts";
import { LoggerFeature } from "~/tools/Logger/index.ts";
import { CacheFeature } from "~/tools/Cache/index.ts";
import { GzipCompressionFeature, GzipCompression } from "~/tools/GzipCompression/index.ts";
import { DirectoryToolFeature } from "~/tools/DirectoryTool/index.ts";
import { FileToolFeature } from "~/tools/FileTool/index.ts";
import {
    DynamoDbClientConfig,
    DynamoDbClientFeature,
    SourceDynamoDbClient,
    TargetDynamoDbClient
} from "~/services/DynamoDbClient/index.ts";
import { OpenSearchClient } from "~/services/OpenSearchClient/index.ts";
import { PresetLoaderFeature, PresetLoader } from "~/features/PresetLoader/index.ts";
import { WorkerSpawnerFeature } from "~/features/WorkerSpawner/index.ts";
import { ModelProviderFeature } from "~/features/ModelProvider/index.ts";
import { TenantLocalesFeature } from "~/features/TenantLocales/index.ts";
import { TransferLifecycleFeature } from "~/features/TransferLifecycle/index.ts";
import { TransformContextFeature } from "~/features/TransformContext/index.ts";
import { PipelineRunnerFeature, PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { OsCommandExecutorFeature, OsCommandExecutor } from "~/features/OsCommandExecutor/index.ts";
import {
    OsRecordDecompressorFeature,
    OsRecordDecompressor
} from "~/features/OsRecordDecompressor/index.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

setup(__dirname + "/../..");

const OS_ENDPOINT = "http://localhost:9200";
const DEFAULT_CREDS = { accessKeyId: "local", secretAccessKey: "local" };

function createIntegrationContainer(endpoint: string, osRealClient: Client): Container {
    const config: MigrationConfig.Interface = {
        storage: "os",
        source: {
            region: "local",
            credentials: DEFAULT_CREDS,
            dynamodb: { tableName: "source-primary" },
            opensearch: { tableName: "source-os" }
        },
        target: {
            region: "local",
            credentials: DEFAULT_CREDS,
            opensearch: {
                endpoint: OS_ENDPOINT,
                tableName: "target-os",
                service: "opensearch" as const
            }
        },
        pipeline: { preset: "v5-to-v6-os" }
    };

    const container = new Container();
    MigrationConfigFeature.register(container, { config });
    LoggerFeature.register(container, { logLevel: "error", json: false });
    CacheFeature.register(container);
    GzipCompressionFeature.register(container);
    DirectoryToolFeature.register(container);
    FileToolFeature.register(container);

    container.registerInstance(DynamoDbClientConfig, {
        source: { region: "local", credentials: DEFAULT_CREDS, endpoint },
        target: { region: "local", credentials: DEFAULT_CREDS, endpoint }
    });
    DynamoDbClientFeature.register(container);

    // Use the real local OS client wrapped as the abstraction
    container.registerInstance(OpenSearchClient, {
        indexExists: async (index: string) => {
            const { body } = await osRealClient.indices.exists({ index });
            return Boolean(body);
        },
        createIndex: async (index: string, body?: any) => {
            await osRealClient.indices.create({ index, body });
        },
        listIndexes: async () => {
            const { body } = await osRealClient.cat.indices({ format: "json" });
            return (body || []) as any;
        },
        putIndexSettings: async (index: string, settings: any) => {
            await osRealClient.indices.putSettings({ index, body: settings });
        },
        getIndexSettings: async (index: string) => {
            const { body } = await osRealClient.indices.getSettings({ index });
            const indexBody = (body as any)[index];
            const refreshInterval = indexBody?.settings?.index?.refresh_interval;
            return { refreshInterval };
        }
    });

    TransferLifecycleFeature.register(container);
    PresetLoaderFeature.register(container);
    WorkerSpawnerFeature.register(container);
    ModelProviderFeature.register(container);
    TenantLocalesFeature.register(container);
    TransformContextFeature.register(container);
    PipelineRunnerFeature.register(container);
    OsCommandExecutorFeature.register(container);
    OsRecordDecompressorFeature.register(container);
    return container;
}

let container: Container;
let endpoint: string;
let osClient: Client;
const createdIndexes = new Set<string>();

beforeAll(async () => {
    await startDb();
    endpoint = process.env.MOCK_DYNAMODB_ENDPOINT!;
    osClient = new Client({ node: OS_ENDPOINT });
    container = createIntegrationContainer(endpoint, osClient);
}, 30000);

afterAll(async () => {
    for (const indexName of createdIndexes) {
        try {
            await osClient.indices.delete({ index: indexName });
        } catch {
            // ignore
        }
    }
    await stopDb();
}, 30000);

beforeEach(async () => {
    await deleteTables();
    await createTables();
});

describe("OS migration integration", () => {
    it("should write gzipped records to target DDB table via OS executor", async () => {
        const sourceDb = container.resolve(SourceDynamoDbClient);
        const targetDb = container.resolve(TargetDynamoDbClient);
        const runner = container.resolve(PipelineRunner);
        const presetLoader = container.resolve(PresetLoader);
        const decompressor = container.resolve(OsRecordDecompressor);
        const executor = container.resolve(OsCommandExecutor);
        const gzip = container.resolve(GzipCompression);

        const preset = await presetLoader.load("v5-to-v6-os");
        preset.configure(runner);

        const mockRecords = await generateOsRecords({ entries: 3 });
        for (const record of mockRecords) {
            await sourceDb.batchPut("source-os", [record as any]);
        }

        const sourceRecords: any[] = [];
        for await (const record of sourceDb.scan("source-os")) {
            sourceRecords.push(record);
        }
        expect(sourceRecords).toHaveLength(6);

        const touchedIndexes = new Map<string, string>();
        const items: OsCommandExecutor.Item[] = [];

        for (const record of sourceRecords) {
            const decompressed = await decompressor.decompress(record);
            if (!decompressed) {
                continue;
            }
            const commands = await runner.processRecord(decompressed.record as BaseRecord);
            for (const put of commands.get<PutRecord>(PutRecord.key)) {
                items.push({
                    record: put.record as BaseRecord,
                    metadata: decompressed.metadata,
                    locale: decompressed.locale
                });
            }
        }

        expect(items.length).toBeGreaterThan(0);

        await executor.execute(items, touchedIndexes);

        for (const idx of touchedIndexes.keys()) {
            createdIndexes.add(idx);
        }

        const targetRecords: any[] = [];
        for await (const record of targetDb.scan("target-os")) {
            targetRecords.push(record);
        }

        expect(targetRecords).toHaveLength(items.length);

        for (const record of targetRecords) {
            expect(record.PK).toBeDefined();
            expect(record.SK).toBeDefined();
            expect(record.TYPE).toBeDefined();
            expect(record.GSI_TENANT).toBeDefined();
            expect(record._et).toBe("CmsEntriesElasticsearch");
            expect(record._ct).toBeDefined();
            expect(record._md).toBeDefined();
            expect(record.index).toBeDefined();
            expect(record.index).not.toContain("en-us");
            expect(record.data.compression).toBe("gzip");
            expect(typeof record.data.value).toBe("string");

            const inner = await gzip.decompress(record.data);
            expect(inner).not.toBeNull();
        }
    }, 30000);

    it("should create OS indexes for records", async () => {
        const runner = container.resolve(PipelineRunner);
        const presetLoader = container.resolve(PresetLoader);
        const decompressor = container.resolve(OsRecordDecompressor);
        const executor = container.resolve(OsCommandExecutor);

        const preset = await presetLoader.load("v5-to-v6-os");
        preset.configure(runner);

        const mockRecords = await generateOsRecords({
            entries: 2,
            modelIds: ["category", "article"]
        });

        const items: OsCommandExecutor.Item[] = [];
        for (const record of mockRecords) {
            const decompressed = await decompressor.decompress(record);
            if (!decompressed) {
                continue;
            }
            const commands = await runner.processRecord(decompressed.record as BaseRecord);
            for (const put of commands.get<PutRecord>(PutRecord.key)) {
                items.push({
                    record: put.record as BaseRecord,
                    metadata: decompressed.metadata,
                    locale: decompressed.locale
                });
            }
        }

        const touchedIndexes = new Map<string, string>();
        await executor.execute(items, touchedIndexes);

        for (const idx of touchedIndexes.keys()) {
            createdIndexes.add(idx);
        }

        const { body: indexes } = await osClient.cat.indices({ format: "json" });
        const indexNames = (indexes || [])
            .map((idx: any) => idx.index)
            .filter((name: string) => name && !name.startsWith("."));

        expect(indexNames).toContain("root-headless-cms-category");
        expect(indexNames).toContain("root-headless-cms-article");
        expect(touchedIndexes.has("root-headless-cms-category")).toBe(true);
        expect(touchedIndexes.has("root-headless-cms-article")).toBe(true);
    }, 30000);

    it("should skip page records during decompression", async () => {
        const decompressor = container.resolve(OsRecordDecompressor);
        const mockRecords = await generateOsRecords({ entries: 2, pages: 3 });

        let cmsCount = 0;
        let skippedCount = 0;

        for (const record of mockRecords) {
            const decompressed = await decompressor.decompress(record);
            if (decompressed) {
                cmsCount++;
            } else {
                skippedCount++;
            }
        }

        expect(cmsCount).toBe(4);
        expect(skippedCount).toBe(6);
    });

    it("should produce valid OS documents verifiable via Lambda simulation", async () => {
        const sourceDb = container.resolve(SourceDynamoDbClient);
        const targetDb = container.resolve(TargetDynamoDbClient);
        const runner = container.resolve(PipelineRunner);
        const presetLoader = container.resolve(PresetLoader);
        const decompressor = container.resolve(OsRecordDecompressor);
        const executor = container.resolve(OsCommandExecutor);
        const gzip = container.resolve(GzipCompression);

        const preset = await presetLoader.load("v5-to-v6-os");
        preset.configure(runner);

        const mockRecords = await generateOsRecords({
            entries: 2,
            modelIds: ["category", "article"]
        });

        for (const record of mockRecords) {
            await sourceDb.batchPut("source-os", [record as any]);
        }

        const sourceRecords: any[] = [];
        for await (const record of sourceDb.scan("source-os")) {
            sourceRecords.push(record);
        }

        const touchedIndexes = new Map<string, string>();
        const items: OsCommandExecutor.Item[] = [];

        for (const record of sourceRecords) {
            const decompressed = await decompressor.decompress(record);
            if (!decompressed) {
                continue;
            }
            const commands = await runner.processRecord(decompressed.record as BaseRecord);
            for (const put of commands.get<PutRecord>(PutRecord.key)) {
                items.push({
                    record: put.record as BaseRecord,
                    metadata: decompressed.metadata,
                    locale: decompressed.locale
                });
            }
        }

        const originalBatchPut = targetDb.batchPut.bind(targetDb);
        const indexedDocuments: Array<{ index: string; body: any }> = [];

        vi.spyOn(targetDb, "batchPut").mockImplementation(async (table: string, records: any[]) => {
            await originalBatchPut(table, records);

            for (const record of records) {
                const data = record.data as { compression?: string; value?: string };
                if (!data || !data.compression) {
                    continue;
                }

                const inner = await gzip.decompress(data as any);
                if (!inner) {
                    continue;
                }

                const indexName = record.index as string;
                const docId = `${record.PK}:${record.SK}`;
                await osClient.index({
                    index: indexName,
                    id: docId,
                    body: inner,
                    refresh: "true"
                });
                indexedDocuments.push({ index: indexName, body: inner });
            }
        });

        await executor.execute(items, touchedIndexes);

        for (const idx of touchedIndexes.keys()) {
            createdIndexes.add(idx);
        }

        expect(indexedDocuments.length).toBeGreaterThan(0);

        for (const indexName of touchedIndexes.keys()) {
            const { body: searchResult } = await osClient.search({
                index: indexName,
                body: { query: { match_all: {} } }
            });

            const total = searchResult.hits.total as { value: number };
            expect(total.value).toBeGreaterThan(0);

            const firstHit = searchResult.hits.hits[0];
            expect(firstHit._id).toContain(":");
            expect(firstHit._source).toHaveProperty("modelId");
            expect(firstHit._source).toHaveProperty("entryId");
            expect(firstHit._source).not.toHaveProperty("locale");
        }

        vi.restoreAllMocks();
    }, 30000);
});

import { describe, it, expect, vi } from "vitest";
import { createOsContainer } from "../../containers/index.ts";
import { Scanner } from "~/domain/pipeline/index.ts";
import { OsScanner } from "~/features/OsScanner/index.ts";
import { SourceDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { OsRecordDecompressor } from "~/features/OsRecordDecompressor/index.ts";
import { CompressionHandler } from "@webiny/utils/exports/api.js";
import { CompressionFeature } from "@webiny/utils/features/compression/feature.js";

interface RawOsRow {
    PK: string;
    SK: string;
    _et: string;
    _ct: string;
    _md: string;
    TYPE: string;
    index: string;
    data: Awaited<CompressionHandler.CompressResponse>;
    [key: string]: unknown;
}

async function makeRawOsRow(
    container: ReturnType<typeof createOsContainer>,
    pk: string,
    inner: Record<string, unknown>
): Promise<RawOsRow> {
    const gzip = container.resolve(CompressionHandler);
    const compressed = await gzip.compress(inner);
    return {
        PK: pk,
        SK: "L",
        _et: "CmsEntriesElasticsearch",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: "cms.entry.l",
        index: "root-headless-cms-en-us-myblog",
        data: compressed
    };
}

describe("OsScanner", () => {
    it("is registrable and resolvable through the Scanner abstraction", () => {
        const container = createOsContainer();
        const scanner = container.resolve(Scanner);
        expect(scanner).toBeDefined();
        expect(typeof scanner.listShards).toBe("function");
        expect(typeof scanner.scan).toBe("function");
    });

    it("returns a single shard when pipeline.segments is unset", async () => {
        const container = createOsContainer();
        const scanner = container.resolve(Scanner) as Scanner.Interface<
            OsScanner.Record,
            OsScanner.Shard
        >;
        const shards = await scanner.listShards();
        expect(shards).toEqual([{ segment: 0, total: 1 }]);
    });

    it("returns N shards when pipeline.segments is set", async () => {
        const container = createOsContainer({ pipelineOverride: { segments: 3 } });
        const scanner = container.resolve(Scanner) as Scanner.Interface<
            OsScanner.Record,
            OsScanner.Shard
        >;
        const shards = await scanner.listShards();
        expect(shards).toEqual([
            { segment: 0, total: 3 },
            { segment: 1, total: 3 },
            { segment: 2, total: 3 }
        ]);
    });

    it("scans the source OS table and yields decompressed flat OsRecords", async () => {
        const container = createOsContainer();
        const row = await makeRawOsRow(container, "T#root#L#en-US#CMS#CME#abc", {
            modelId: "blogPost",
            title: "Hello"
        });
        // Re-create the container with the row pre-populated under the OS table name
        const seeded = createOsContainer({ sourceRecords: { "source-os": [row] } });
        const scanner = seeded.resolve(Scanner) as Scanner.Interface<
            OsScanner.Record,
            OsScanner.Shard
        >;

        const collected: OsScanner.Record[] = [];
        for await (const record of scanner.scan({ segment: 0, total: 1 })) {
            collected.push(record);
        }

        expect(collected).toHaveLength(1);
        const r = collected[0]!;
        expect(r.PK).toBe("T#root#L#en-US#CMS#CME#abc");
        expect(r.SK).toBe("L");
        expect(r.TYPE).toBe("cms.entry.l");
        expect(r.index).toBe("root-headless-cms-en-us-myblog");
        expect(r.data.modelId).toBe("blogPost");
        expect(r.data.title).toBe("Hello");
    });

    it("silently skips records that the decompressor rejects (returns null)", async () => {
        const container = createOsContainer({
            sourceRecords: {
                "source-os": [
                    {
                        PK: "x",
                        SK: "L",
                        _et: "Anything",
                        _ct: "",
                        _md: "",
                        TYPE: "ignored",
                        index: "some-index"
                    } as unknown as SourceDynamoDbClient.Record
                ]
            }
        });
        const decompressor = container.resolve(OsRecordDecompressor);
        const spy = vi.spyOn(decompressor, "decompress").mockResolvedValue(null);

        const scanner = container.resolve(Scanner) as Scanner.Interface<
            OsScanner.Record,
            OsScanner.Shard
        >;
        const collected: OsScanner.Record[] = [];
        for await (const record of scanner.scan({ segment: 0, total: 1 })) {
            collected.push(record);
        }

        expect(collected).toEqual([]);
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    it("throws inside scan() when called against a non-OS container", async () => {
        // The DDB-mode container registers DdbScanner under the Scanner abstraction,
        // not OsScanner. We exercise OsScanner directly to verify its storage-mode
        // guard fires. The shape of `OsScannerImpl` requires the source DDB client,
        // the decompressor, and the migration config — but the guard fires inside
        // scan() before any of those are read in earnest, so we can construct it
        // with a non-OS config.
        const { Container } = await import("@webiny/di");
        const { ContainerToken } = await import("~/base/index.ts");
        const { TransferContext } =
            await import("~/features/TransferLifecycle/abstractions/TransferContext.ts");
        const { MigrationConfigFeature } = await import("~/features/MigrationConfig/index.ts");
        const { LoggerFeature } = await import("~/tools/Logger/index.ts");
        const { CacheFeature } = await import("~/tools/Cache/index.ts");
        const { DirectoryToolFeature } = await import("~/tools/DirectoryTool/index.ts");
        const { FileToolFeature } = await import("~/tools/FileTool/index.ts");
        const { SourceDynamoDbClient: SourceDdb, TargetDynamoDbClient: TargetDdb } =
            await import("~/services/DynamoDbClient/abstractions/DynamoDbClient.ts");
        const { MockDynamoDbClient } =
            await import("../../services/DynamoDbClient/MockDynamoDbClient.ts");
        const { OsRecordDecompressorFeature } =
            await import("~/features/OsRecordDecompressor/index.ts");
        const { OsScannerFeature: ScannerFeature } = await import("~/features/OsScanner/index.ts");

        // Construct a DDB-mode config and inject it into a fresh container that still
        // registers OsScanner as the Scanner. When scan() is called, its guard should fire.
        const ddbConfig = {
            storage: "ddb" as const,
            source: {
                region: "us-east-1",
                credentials: { accessKeyId: "x", secretAccessKey: "y" },
                dynamodb: { tableName: "ddb-source" },
                s3: { bucket: "ddb-bucket" }
            },
            target: {
                region: "us-east-1",
                credentials: { accessKeyId: "x", secretAccessKey: "y" },
                dynamodb: { tableName: "ddb-target" },
                s3: { bucket: "ddb-target-bucket" }
            },
            pipeline: { preset: "v5-to-v6" }
        };

        const container = new Container();
        container.registerInstance(ContainerToken, container);
        container.registerInstance(TransferContext, { runId: "guard-test" });
        MigrationConfigFeature.register(container, { config: ddbConfig });
        LoggerFeature.register(container, { logLevel: "error", json: false });
        CacheFeature.register(container);
        CompressionFeature.register(container);
        DirectoryToolFeature.register(container);
        FileToolFeature.register(container);
        container.registerInstance(SourceDdb, new MockDynamoDbClient());
        container.registerInstance(TargetDdb, new MockDynamoDbClient());
        OsRecordDecompressorFeature.register(container);
        ScannerFeature.register(container);

        const scanner = container.resolve(Scanner) as Scanner.Interface<
            OsScanner.Record,
            OsScanner.Shard
        >;
        await expect(async () => {
            for await (const _ of scanner.scan({ segment: 0, total: 1 })) {
                // Should never iterate
            }
        }).rejects.toThrow(/OS storage mode/i);
    });
});

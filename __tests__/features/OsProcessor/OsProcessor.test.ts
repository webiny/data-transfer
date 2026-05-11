import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOsContainer } from "../../containers/index.ts";
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { TouchedIndexes } from "~/features/TouchedIndexes/index.ts";
import { DdbExecutor } from "~/features/DdbExecutor/abstractions/DdbExecutor.ts";
import { OpenSearchClient } from "~/services/OpenSearchClient/abstractions/OpenSearchClient.ts";
import { CompressionHandler } from "@webiny/utils/exports/api.js";
import type { OsScanner } from "~/features/OsScanner/index.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { OsProcessor } from "~/features/OsProcessor/index.ts";
import { MockOpenSearchClient } from "../../services/OpenSearchClient/MockOpenSearchClient.ts";

interface OsProcessorSlice {
    putRecord(record: Record<string, unknown>): void;
}

/**
 * In the OS container, only OsProcessor is registered against Core/Processor,
 * so container.resolve(Processor) returns the OsProcessor singleton.
 */
type OsProcessorInstance = Processor.Interface<
    BaseTransformContext.Interface<unknown>,
    OsProcessorSlice
> & {
    extendContext(base: BaseTransformContext.Interface<unknown>): OsProcessorSlice;
    onEnd(ctx: BaseTransformContext.Interface<unknown> & OsProcessorSlice): void | Promise<void>;
};

function makeOsRecord(idSuffix: string, indexName: string): OsScanner.Record {
    return {
        PK: `T#root#CMS#CME#${idSuffix}`,
        SK: "L",
        _et: "CmsEntriesElasticsearch",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: "cms.entry.l",
        index: indexName,
        data: {}
    };
}

interface BaseStub<TRecord> {
    base: BaseTransformContext.Interface<TRecord>;
    captured: unknown[];
}

function makeBase<TRecord>(record: TRecord): BaseStub<TRecord> {
    const captured: unknown[] = [];
    const base: BaseTransformContext.Interface<TRecord> = {
        record,
        original: Object.freeze(record) as Readonly<TRecord>,
        modelProvider: {} as BaseTransformContext.Interface<TRecord>["modelProvider"],
        cache: {} as BaseTransformContext.Interface<TRecord>["cache"],
        compressionHandler: {} as CompressionHandler.Interface,
        logger: {
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
            fatal: () => {},
            done: () => {},
            child: function () {
                return this;
            }
        } as unknown as Logger.Interface,
        replace(newRecord: TRecord): void {
            base.record = newRecord;
        },
        addCommand(cmd): void {
            captured.push(cmd);
        }
    };
    return { base, captured };
}

describe("OsProcessor", () => {
    describe("extendContext", () => {
        it("returns a slice with putRecord that pushes PutRecord commands targeted at the OS table", () => {
            const container = createOsContainer();
            const processor = container.resolve(Processor) as OsProcessorInstance;
            const { base, captured } = makeBase(makeOsRecord("a", "idx-foo"));

            const slice = processor.extendContext(base);
            slice.putRecord({ PK: "x", SK: "y", index: "idx-foo", data: "payload" });

            expect(captured).toHaveLength(1);
            const put = captured[0] as PutRecord;
            expect(put.key).toBe(PutRecord.key);
            expect(put.table).toBe("target-os");
            expect(put.record).toMatchObject({ PK: "x", index: "idx-foo" });
        });
    });

    describe("onEnd", () => {
        it("auto-puts ctx.record through the slice helper", async () => {
            const container = createOsContainer();
            const processor = container.resolve(Processor) as OsProcessorInstance;
            const record = makeOsRecord("b", "idx-bar");
            const { base, captured } = makeBase(record);

            const slice = processor.extendContext(base);
            const ctx = { ...base, ...slice };
            await processor.onEnd(ctx);

            expect(captured).toHaveLength(1);
            expect((captured[0] as PutRecord).record).toEqual(record);
        });
    });

    describe("execute", () => {
        it("is a no-op when no PutRecord commands are present", async () => {
            const container = createOsContainer();
            const processor = container.resolve(Processor) as OsProcessorInstance;
            const ddbExecutor = container.resolve(DdbExecutor);
            const executed: PutRecord[][] = [];
            const originalExec = ddbExecutor.execute.bind(ddbExecutor);
            ddbExecutor.execute = async (puts: PutRecord[]): Promise<void> => {
                executed.push(puts);
                await originalExec(puts);
            };

            await processor.execute(new Commands());

            expect(executed).toHaveLength(0);
        });

        it("gzips record.data before handing put commands off to the DdbExecutor", async () => {
            const container = createOsContainer();
            const processor = container.resolve(Processor) as OsProcessorInstance;
            const ddbExecutor = container.resolve(DdbExecutor);
            const compressionHandler = container.resolve(CompressionHandler);
            const captured: PutRecord[][] = [];
            ddbExecutor.execute = async (puts: PutRecord[]): Promise<void> => {
                captured.push(puts);
            };

            const commands = new Commands();
            commands.add(
                PutRecord.create({
                    table: "target-os",
                    record: { PK: "x", index: "idx-foo", data: "hello-world" }
                })
            );

            await processor.execute(commands);

            expect(captured).toHaveLength(1);
            expect(captured[0]).toHaveLength(1);
            const gzipped = (captured[0]![0]!.record as { data: unknown }).data;
            const expected = await compressionHandler.compress("hello-world");
            expect(gzipped).toEqual(expected);
        });

        it("ensures each target index exists via the OpenSearch client before dispatching puts", async () => {
            const container = createOsContainer();
            const processor = container.resolve(Processor) as OsProcessorInstance;
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;
            const ddbExecutor = container.resolve(DdbExecutor);
            ddbExecutor.execute = async (): Promise<void> => {};

            const commands = new Commands();
            commands.add(
                PutRecord.create({
                    table: "target-os",
                    record: { PK: "a", index: "new-idx", data: "d1" }
                })
            );
            commands.add(
                PutRecord.create({
                    table: "target-os",
                    record: { PK: "b", index: "new-idx", data: "d2" }
                })
            );

            await processor.execute(commands);

            // Index should have been created exactly once (dedup across puts).
            expect(osClient.getIndexCount()).toBe(1);
            expect(await osClient.indexExists("new-idx")).toBe(true);
        });
    });

    describe("afterShard", () => {
        let originalCwd: string;
        let workDir: string;

        beforeEach(async () => {
            originalCwd = process.cwd();
            workDir = await mkdtemp(join(tmpdir(), "os-processor-aftershard-"));
            process.chdir(workDir);
        });

        afterEach(() => {
            process.chdir(originalCwd);
        });

        it("writes <segment>-indexes.json when touchedIndexes has entries", async () => {
            const container = createOsContainer();
            const processor = container.resolve(Processor) as OsProcessorInstance;
            const touchedIndexes = container.resolve(TouchedIndexes);

            touchedIndexes.record("idx-foo", "1s");
            touchedIndexes.record("idx-bar", "5s");

            await processor.afterShard!({ segment: 2, totalSegments: 4 });

            const filePath = join(workDir, ".transfer", "test-run-id", "2-indexes.json");
            const content = await readFile(filePath, "utf-8");
            expect(JSON.parse(content)).toEqual([
                { indexName: "idx-foo", originalRefresh: "1s" },
                { indexName: "idx-bar", originalRefresh: "5s" }
            ]);
        });

        it("writes nothing when touchedIndexes is empty", async () => {
            const container = createOsContainer();
            const processor = container.resolve(Processor) as OsProcessorInstance;

            await processor.afterShard!({ segment: 0, totalSegments: 1 });

            const transferDir = join(workDir, ".transfer", "test-run-id");
            // Directory must not exist — EnableRefreshHook treats its absence
            // as "no indexes were touched" and early-returns.
            await expect(readdir(transferDir)).rejects.toThrow(/ENOENT/);
        });
    });

    describe("checkAccess", () => {
        it("returns ok when listIndexes succeeds", async () => {
            const container = createOsContainer();
            const processor = container
                .resolveAll(Processor)
                .find(p => p.constructor === OsProcessor)!;

            const entries = await processor.checkAccess();

            expect(entries).toHaveLength(1);
            expect(entries[0]).toEqual({
                label: "OpenSearch cluster: https://es.example.com",
                status: "ok"
            });
        });

        it("returns denied when listIndexes throws HTTP 403", async () => {
            const container = createOsContainer();
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;
            vi.spyOn(osClient, "listIndexes").mockRejectedValue(
                Object.assign(new Error("Forbidden"), { statusCode: 403 })
            );
            const processor = container
                .resolveAll(Processor)
                .find(p => p.constructor === OsProcessor)!;

            const entries = await processor.checkAccess();

            expect(entries[0]).toEqual({
                label: "OpenSearch cluster: https://es.example.com",
                status: "denied"
            });
        });

        it("returns denied when listIndexes throws HTTP 401", async () => {
            const container = createOsContainer();
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;
            vi.spyOn(osClient, "listIndexes").mockRejectedValue(
                Object.assign(new Error("Unauthorized"), { statusCode: 401 })
            );
            const processor = container
                .resolveAll(Processor)
                .find(p => p.constructor === OsProcessor)!;

            const entries = await processor.checkAccess();

            expect(entries[0]).toEqual({
                label: "OpenSearch cluster: https://es.example.com",
                status: "denied"
            });
        });

        it("returns missing when listIndexes throws HTTP 404", async () => {
            const container = createOsContainer();
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;
            vi.spyOn(osClient, "listIndexes").mockRejectedValue(
                Object.assign(new Error("Not found"), { statusCode: 404 })
            );
            const processor = container
                .resolveAll(Processor)
                .find(p => p.constructor === OsProcessor)!;

            const entries = await processor.checkAccess();

            expect(entries[0]).toEqual({
                label: "OpenSearch cluster: https://es.example.com",
                status: "missing"
            });
        });

        it("returns unknown when listIndexes throws a non-auth error", async () => {
            const container = createOsContainer();
            const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;
            vi.spyOn(osClient, "listIndexes").mockRejectedValue(new Error("connection refused"));
            const processor = container
                .resolveAll(Processor)
                .find(p => p.constructor === OsProcessor)!;

            const entries = await processor.checkAccess();

            expect(entries[0]).toEqual({
                label: "OpenSearch cluster: https://es.example.com",
                status: "unknown"
            });
        });

        it("returns empty array when OpenSearch is not configured", async () => {
            const container = createOsContainer({ noOpenSearch: true });
            const processor = container
                .resolveAll(Processor)
                .find(p => p.constructor === OsProcessor)!;

            const entries = await processor.checkAccess();

            expect(entries).toHaveLength(0);
        });
    });
});

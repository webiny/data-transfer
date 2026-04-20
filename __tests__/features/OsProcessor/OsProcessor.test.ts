import { describe, it, expect } from "vitest";
import { createOsContainer } from "../../containers/index.ts";
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { TouchedIndexes } from "~/features/TouchedIndexes/index.ts";
import { DdbExecutor } from "~/features/DdbExecutor/abstractions/DdbExecutor.ts";
import { OpenSearchClient } from "~/services/OpenSearchClient/abstractions/OpenSearchClient.ts";
import { GzipCompression } from "~/tools/GzipCompression/abstractions/GzipCompression.ts";
import type { OsScanner } from "~/features/OsScanner/index.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
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
        replace(newRecord: TRecord): void {
            base.record = newRecord;
        },
        addCommand(cmd): void {
            captured.push(cmd);
        },
        async queryRecord(): Promise<null> {
            return null;
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
            const gzip = container.resolve(GzipCompression);
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
            const expected = await gzip.compress("hello-world");
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

    describe("getShardState", () => {
        it("returns an initial empty touchedIndexes list", () => {
            const container = createOsContainer();
            const processor = container.resolve(Processor) as OsProcessorInstance;
            expect(processor.getShardState()).toEqual({ touchedIndexes: [] });
        });

        it("reflects TouchedIndexes.record() mutations from the container singleton", () => {
            const container = createOsContainer();
            const processor = container.resolve(Processor) as OsProcessorInstance;
            const touchedIndexes = container.resolve(TouchedIndexes);

            touchedIndexes.record("idx-foo", "1s");

            expect(processor.getShardState()).toEqual({
                touchedIndexes: [{ indexName: "idx-foo", originalRefresh: "1s" }]
            });
        });
    });
});

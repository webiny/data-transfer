import { describe, it, expect } from "vitest";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { createDdbContainer } from "../../containers/index.ts";
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { DdbExecutor } from "~/features/DdbExecutor/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { CompressionHandler } from "@webiny/utils/exports/api.js";

function makeRecord(pk: string, sk: string): BaseRecord {
    return {
        PK: pk,
        SK: sk,
        _et: "Test",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: "test"
    };
}

interface DdbProcessorSlice {
    putRecord(record: Record<string, unknown>): void;
}

/**
 * In the DDB container, DdbProcessor is the only impl registered against the
 * generic Core/Processor abstraction (S3Processor has its own abstraction),
 * so resolving by Processor gives back the DdbProcessor singleton.
 */
type DdbProcessorInstance = Processor.Interface<
    BaseTransformContext.Interface<unknown>,
    DdbProcessorSlice
> & {
    extendContext(base: BaseTransformContext.Interface<unknown>): DdbProcessorSlice;
    onEnd(ctx: BaseTransformContext.Interface<unknown> & DdbProcessorSlice): void | Promise<void>;
};

interface BaseStub<TRecord> {
    base: BaseTransformContext.Interface<TRecord>;
    captured: unknown[];
}

/** Minimal BaseTransformContext stub for unit-testing extendContext + onEnd. */
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

describe("DdbProcessor", () => {
    describe("extendContext", () => {
        it("returns a slice with putRecord that pushes PutRecord commands via ctx.addCommand", () => {
            const container = createDdbContainer();
            const processor = container.resolve(Processor) as DdbProcessorInstance;
            const { base, captured } = makeBase(makeRecord("PK1", "SK1"));

            const slice = processor.extendContext(base);
            slice.putRecord({ PK: "x", SK: "y" });

            expect(captured).toHaveLength(1);
            expect((captured[0] as PutRecord).key).toBe(PutRecord.key);
            expect((captured[0] as PutRecord).record).toEqual({ PK: "x", SK: "y" });
            expect((captured[0] as PutRecord).table).toBe("target-table");
        });
    });

    describe("onEnd", () => {
        it("auto-puts ctx.record through the slice helper", async () => {
            const container = createDdbContainer();
            const processor = container.resolve(Processor) as DdbProcessorInstance;
            const record = makeRecord("PK1", "SK1");
            const { base, captured } = makeBase(record);

            const slice = processor.extendContext(base);
            const ctx = { ...base, ...slice };
            await processor.onEnd(ctx);

            expect(captured).toHaveLength(1);
            expect((captured[0] as PutRecord).record).toEqual(record);
        });
    });

    describe("execute", () => {
        it("drains PutRecord commands and delegates to DdbExecutor", async () => {
            const container = createDdbContainer();
            const processor = container.resolve(Processor) as DdbProcessorInstance;
            const executor = container.resolve(DdbExecutor);
            const executed: PutRecord[][] = [];
            const original = executor.execute.bind(executor);
            executor.execute = async (puts: PutRecord[]): Promise<void> => {
                executed.push(puts);
                await original(puts);
            };

            const commands = new Commands();
            const put = PutRecord.create({ table: "target-table", record: { PK: "a", SK: "1" } });
            commands.add(put);
            commands.add({ key: "weird", dedupKey: undefined });

            await processor.execute(commands);

            expect(executed).toHaveLength(1);
            expect(executed[0]).toEqual([put]);
        });

        it("calls the executor with an empty array when Commands is empty", async () => {
            const container = createDdbContainer();
            const processor = container.resolve(Processor) as DdbProcessorInstance;
            const executor = container.resolve(DdbExecutor);
            const executed: PutRecord[][] = [];
            const original = executor.execute.bind(executor);
            executor.execute = async (puts: PutRecord[]): Promise<void> => {
                executed.push(puts);
                await original(puts);
            };

            await processor.execute(new Commands());

            expect(executed).toHaveLength(1);
            expect(executed[0]).toEqual([]);
        });
    });

    describe("afterShard", () => {
        it("is not implemented (no cross-boundary state)", () => {
            const container = createDdbContainer();
            const processor = container.resolve(Processor) as DdbProcessorInstance;
            expect(processor.afterShard).toBeUndefined();
        });
    });
});

import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import { Processor } from "~/domain/pipeline/index.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

interface TestRecord {
    id: string;
}

interface TestSlice {
    emitted: string[];
    emit(cmd: string): void;
}

type TestBase = BaseTransformContext.Interface<TestRecord>;
type TestContext = TestBase & TestSlice;

/**
 * Test processor matching the new-shape Processor.Interface<TBase, TSlice>.
 * `extendContext` returns a slice the runner spreads over the base ctx.
 * `onEnd` uses ctx.addCommand to emit a terminal PutRecord, mirroring
 * DdbProcessor semantics. `execute` records buffer drains for assertions.
 */
class FakeProcessor implements Processor.Interface<TestBase, TestSlice> {
    public readonly executed: Commands[] = [];
    public lastEmitted: string[] = [];

    public extendContext(_base: TestBase): TestSlice {
        const emitted: string[] = [];
        this.lastEmitted = emitted;
        return {
            emitted,
            emit: (cmd: string) => {
                emitted.push(cmd);
            }
        };
    }

    public onEnd(ctx: TestContext): void {
        ctx.addCommand(
            PutRecord.create({
                table: "t",
                record: ctx.record as unknown as Record<string, unknown>
            })
        );
    }

    public async execute(commands: Commands): Promise<void> {
        commands.get(PutRecord.key);
        this.executed.push(commands);
    }

    public getShardState(): { emittedCount: number } {
        return { emittedCount: this.lastEmitted.length };
    }
}

const TestProcessor = Processor.createImplementation({
    implementation: FakeProcessor,
    dependencies: []
});

describe("Processor abstraction", () => {
    it("is registrable and resolvable via the DI container", () => {
        const container = new Container();
        container.register(TestProcessor).inSingletonScope();
        const processor = container.resolve(Processor);
        expect(processor).toBeInstanceOf(FakeProcessor);
    });

    it("extendContext returns a fresh slice per call, with slice helpers wired up", () => {
        const container = new Container();
        container.register(TestProcessor).inSingletonScope();
        const processor = container.resolve(Processor) as FakeProcessor;

        const baseA = { record: { id: "a" } } as unknown as TestBase;
        const baseB = { record: { id: "b" } } as unknown as TestBase;
        const sliceA = processor.extendContext(baseA);
        const sliceB = processor.extendContext(baseB);

        expect(sliceA).not.toBe(sliceB);
        sliceA.emit("one");
        sliceB.emit("two");
        expect(sliceA.emitted).toEqual(["one"]);
        expect(sliceB.emitted).toEqual(["two"]);
    });

    it("onEnd is invokable with a merged context and delegates to addCommand", () => {
        const container = new Container();
        container.register(TestProcessor).inSingletonScope();
        const processor = container.resolve(Processor) as FakeProcessor;

        const captured: unknown[] = [];
        const base = {
            record: { id: "r1" },
            addCommand: (cmd: unknown) => {
                captured.push(cmd);
            }
        } as unknown as TestBase;

        const slice = processor.extendContext(base);
        const ctx = { ...base, ...slice } as TestContext;

        processor.onEnd(ctx);
        expect(captured).toHaveLength(1);
    });

    it("execute consumes a Commands instance and records it for inspection", async () => {
        const container = new Container();
        container.register(TestProcessor).inSingletonScope();
        const processor = container.resolve(Processor) as FakeProcessor;

        const commands = new Commands();
        commands.add(PutRecord.create({ table: "t", record: { PK: "p", SK: "s" } }));
        await processor.execute(commands);

        expect(processor.executed).toHaveLength(1);
        expect(processor.executed[0]).toBe(commands);
    });

    it("getShardState reflects slice mutation from the latest extendContext", () => {
        const container = new Container();
        container.register(TestProcessor).inSingletonScope();
        const processor = container.resolve(Processor) as FakeProcessor;

        const slice = processor.extendContext({ record: { id: "x" } } as unknown as TestBase);
        slice.emit("one");
        slice.emit("two");

        expect(processor.getShardState()).toEqual({ emittedCount: 2 });
    });
});

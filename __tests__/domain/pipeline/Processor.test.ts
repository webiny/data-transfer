import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import { Processor } from "~/domain/pipeline/index.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";

interface TestRecord {
    id: string;
}

interface TestContext {
    record: TestRecord;
    emit(cmd: string): void;
}

class FakeProcessor implements Processor.Interface<TestRecord, TestContext> {
    public readonly executed: Commands[] = [];
    private shardState: string[] = [];

    public async execute(commands: Commands): Promise<void> {
        this.executed.push(commands);
    }

    public getShardState(): { emitted: string[] } {
        return { emitted: [...this.shardState] };
    }

    public createContext(record: TestRecord): TestContext {
        return {
            record,
            emit: (cmd: string) => {
                this.shardState.push(cmd);
            }
        };
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

    it("creates a fresh context per record", () => {
        const container = new Container();
        container.register(TestProcessor).inSingletonScope();
        const processor = container.resolve(Processor) as Processor.Interface<
            TestRecord,
            TestContext
        >;

        const ctxA = processor.createContext({ id: "a" });
        const ctxB = processor.createContext({ id: "b" });
        expect(ctxA).not.toBe(ctxB);
        expect(ctxA.record.id).toBe("a");
        expect(ctxB.record.id).toBe("b");
    });

    it("exposes accumulated shard state", async () => {
        const container = new Container();
        container.register(TestProcessor).inSingletonScope();
        const processor = container.resolve(Processor) as Processor.Interface<
            TestRecord,
            TestContext
        >;

        const ctx = processor.createContext({ id: "x" });
        ctx.emit("one");
        ctx.emit("two");

        expect(processor.getShardState()).toEqual({ emitted: ["one", "two"] });
    });
});

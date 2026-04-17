import { describe, it, expect, vi } from "vitest";
import { createDdbContainer } from "../../containers/index.ts";
import { Processor } from "~/domain/pipeline/index.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { DdbCommandExecutor } from "~/features/DdbCommandExecutor/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

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

describe("DdbProcessor", () => {
    it("is registrable and resolvable through the Processor abstraction", () => {
        const container = createDdbContainer();
        const processor = container.resolve(Processor);
        expect(processor).toBeDefined();
        expect(typeof processor.execute).toBe("function");
        expect(typeof processor.createContext).toBe("function");
        expect(typeof processor.getShardState).toBe("function");
    });

    it("creates a fresh context per record with a Commands collection", () => {
        const container = createDdbContainer();
        const processor = container.resolve(Processor);

        const ctxA = processor.createContext(makeRecord("a", "1"));
        const ctxB = processor.createContext(makeRecord("b", "1"));

        expect(ctxA).not.toBe(ctxB);
        expect((ctxA as unknown as { record: BaseRecord }).record.PK).toBe("a");
        expect((ctxA as unknown as { commands: Commands }).commands).toBeInstanceOf(Commands);
    });

    it("delegates execute() to the underlying DdbCommandExecutor", async () => {
        const container = createDdbContainer();
        const processor = container.resolve(Processor);
        const executor = container.resolve(DdbCommandExecutor);
        const spy = vi.spyOn(executor, "execute");

        const commands = new Commands();
        commands.add(PutRecord.create({ table: "target-table", record: { PK: "a", SK: "1" } }));
        await processor.execute(commands);

        expect(spy).toHaveBeenCalledWith(commands);
    });

    it("returns an empty shard-state object", () => {
        const container = createDdbContainer();
        const processor = container.resolve(Processor);
        expect(processor.getShardState()).toEqual({});
    });
});

import { describe, it, expect, vi } from "vitest";
import { createOsContainer } from "../../containers/index.ts";
import { Processor } from "~/domain/pipeline/index.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { OsCommandExecutor } from "~/features/OsCommandExecutor/index.ts";
import type { OsRecord } from "~/features/OsScanner/abstractions/OsScanner.ts";

function makeOsRecord(pk: string, indexName: string): OsRecord {
    return {
        PK: pk,
        SK: "L",
        _et: "CmsEntriesElasticsearch",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: "cms.entry.l",
        index: indexName,
        locale: "en-US"
    };
}

describe("OsProcessor", () => {
    it("is registrable and resolvable through the Processor abstraction", () => {
        const container = createOsContainer();
        const processor = container.resolve(Processor);
        expect(processor).toBeDefined();
        expect(typeof processor.execute).toBe("function");
        expect(typeof processor.createContext).toBe("function");
        expect(typeof processor.getShardState).toBe("function");
    });

    it("creates a fresh context per record with a Commands collection", () => {
        const container = createOsContainer();
        const processor = container.resolve(Processor);

        const recA = makeOsRecord("a", "idx-1");
        const recB = makeOsRecord("b", "idx-1");

        const ctxA = processor.createContext(recA);
        const ctxB = processor.createContext(recB);

        expect(ctxA).not.toBe(ctxB);
        expect((ctxA as unknown as { record: OsRecord }).record.PK).toBe("a");
        expect((ctxA as unknown as { commands: Commands }).commands).toBeInstanceOf(Commands);
    });

    it("builds OsItems from PutRecord commands and delegates to OsCommandExecutor", async () => {
        const container = createOsContainer();
        const processor = container.resolve(Processor);
        const executor = container.resolve(OsCommandExecutor);
        const spy = vi.spyOn(executor, "execute").mockResolvedValue(undefined);

        const commands = new Commands();
        commands.add(
            PutRecord.create({
                table: "target-os",
                record: makeOsRecord("a", "idx-foo")
            })
        );
        commands.add(
            PutRecord.create({
                table: "target-os",
                record: makeOsRecord("b", "idx-bar")
            })
        );

        await processor.execute(commands);

        expect(spy).toHaveBeenCalledTimes(1);
        const [items, touchedIndexes] = spy.mock.calls[0]!;
        expect(items).toHaveLength(2);
        expect(items[0]!.record.PK).toBe("a");
        expect(items[0]!.metadata.index).toBe("idx-foo");
        expect(items[0]!.metadata._ct).toBe("2024-01-01T00:00:00.000Z");
        expect(items[0]!.metadata._md).toBe("2024-01-01T00:00:00.000Z");
        expect(items[0]!.locale).toBe("en-US");
        expect(items[1]!.metadata.index).toBe("idx-bar");
        expect(touchedIndexes).toBeInstanceOf(Map);
        spy.mockRestore();
    });

    it("is a no-op when the buffer contains no PutRecord commands", async () => {
        const container = createOsContainer();
        const processor = container.resolve(Processor);
        const executor = container.resolve(OsCommandExecutor);
        const spy = vi.spyOn(executor, "execute").mockResolvedValue(undefined);

        await processor.execute(new Commands());

        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it("returns initial shard state with an empty touchedIndexes object", () => {
        const container = createOsContainer();
        const processor = container.resolve(Processor);
        expect(processor.getShardState()).toEqual({ touchedIndexes: {} });
    });

    it("getShardState reflects mutations the executor makes to the touchedIndexes Map", async () => {
        const container = createOsContainer();
        const processor = container.resolve(Processor);
        const executor = container.resolve(OsCommandExecutor);

        // Stub execute to add a fake entry to the map it's given.
        const spy = vi
            .spyOn(executor, "execute")
            .mockImplementation(async (_items, touchedIndexes) => {
                touchedIndexes.set("idx-foo", "1s");
            });

        const commands = new Commands();
        commands.add(
            PutRecord.create({
                table: "target-os",
                record: makeOsRecord("a", "idx-foo")
            })
        );
        await processor.execute(commands);

        expect(processor.getShardState()).toEqual({ touchedIndexes: { "idx-foo": "1s" } });
        spy.mockRestore();
    });
});

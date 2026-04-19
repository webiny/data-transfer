import { describe, it, expect, vi } from "vitest";
import { createOsContainer } from "../../containers/index.ts";
import { Processor } from "~/domain/pipeline/index.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { PutOsDynamoDbRecordExecutor } from "~/features/PutOsDynamoDbRecordExecutor/index.ts";
import { TouchedIndexes } from "~/features/TouchedIndexes/index.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { OsScanner } from "~/features/OsScanner/index.ts";

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

describe("OsProcessor", () => {
    it("dispatches PutRecord commands to the PutOsDynamoDbRecordExecutor", async () => {
        const container = createOsContainer();
        const processor = container.resolve(Processor);
        const putOsExecutor = container.resolve(PutOsDynamoDbRecordExecutor);
        const logger = container.resolve(Logger);

        const putSpy = vi.spyOn(putOsExecutor, "execute").mockResolvedValue(undefined);
        const warnSpy = vi.spyOn(logger, "warn");

        const record = makeOsRecord("a", "idx-foo");
        const put = PutRecord.create({ table: "target-os", record });

        const commands = new Commands();
        commands.add(put);

        await processor.execute(commands);

        expect(putSpy).toHaveBeenCalledTimes(1);
        expect(putSpy).toHaveBeenCalledWith([put]);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it("calls the executor with an empty array when Commands is empty and never warns", async () => {
        const container = createOsContainer();
        const processor = container.resolve(Processor);
        const putOsExecutor = container.resolve(PutOsDynamoDbRecordExecutor);
        const logger = container.resolve(Logger);

        const putSpy = vi.spyOn(putOsExecutor, "execute").mockResolvedValue(undefined);
        const warnSpy = vi.spyOn(logger, "warn");

        await processor.execute(new Commands());

        expect(putSpy).toHaveBeenCalledTimes(1);
        expect(putSpy).toHaveBeenCalledWith([]);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it("dedupes warnings: the same unknown key across calls only warns once", async () => {
        const container = createOsContainer();
        const processor = container.resolve(Processor);
        const logger = container.resolve(Logger);
        const warnSpy = vi.spyOn(logger, "warn");

        const first = new Commands();
        first.add({ key: "weird", dedupKey: undefined });
        await processor.execute(first);

        const second = new Commands();
        second.add({ key: "weird", dedupKey: undefined });
        await processor.execute(second);

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('OsProcessor does not handle command key "weird"')
        );
    });

    it("warns again for a NEW unknown key in a later call", async () => {
        const container = createOsContainer();
        const processor = container.resolve(Processor);
        const logger = container.resolve(Logger);
        const warnSpy = vi.spyOn(logger, "warn");

        const first = new Commands();
        first.add({ key: "weird", dedupKey: undefined });
        await processor.execute(first);

        const second = new Commands();
        second.add({ key: "other", dedupKey: undefined });
        await processor.execute(second);

        expect(warnSpy).toHaveBeenCalledTimes(2);
        expect(warnSpy).toHaveBeenNthCalledWith(1, expect.stringContaining('"weird"'));
        expect(warnSpy).toHaveBeenNthCalledWith(2, expect.stringContaining('"other"'));
    });

    it("returns initial shard state with an empty touchedIndexes array", () => {
        const container = createOsContainer();
        const processor = container.resolve(Processor);

        expect(processor.getShardState()).toEqual({ touchedIndexes: [] });
    });

    it("getShardState reflects TouchedIndexes.record() mutations from the container singleton", () => {
        const container = createOsContainer();
        const processor = container.resolve(Processor);
        const touchedIndexes = container.resolve(TouchedIndexes);

        touchedIndexes.record("idx-foo", "1s");

        expect(processor.getShardState()).toEqual({
            touchedIndexes: [{ indexName: "idx-foo", originalRefresh: "1s" }]
        });
    });

    it("createContext returns a context carrying the record", () => {
        const container = createOsContainer();
        const processor = container.resolve(Processor);

        const record = makeOsRecord("a", "idx-foo");
        const ctx = processor.createContext(record);

        expect((ctx as unknown as { record: OsScanner.Record }).record).toEqual(record);
        expect((ctx as unknown as { record: OsScanner.Record }).record.PK).toBe("T#root#CMS#CME#a");
    });
});

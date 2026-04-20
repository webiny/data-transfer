import { describe, it, expect, vi } from "vitest";
import { createDdbContainer } from "../../containers/index.ts";
import { Processor } from "~/domain/pipeline/index.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { S3Copy } from "~/domain/transform/commands/S3Copy.ts";
import { DdbExecutor } from "~/features/DdbExecutor/index.ts";
import { S3Processor } from "~/features/S3Processor/index.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
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
    it("dispatches puts and copies in parallel and warns once for unknown keys", async () => {
        const container = createDdbContainer();
        const processor = container.resolve(Processor);
        const putExecutor = container.resolve(DdbExecutor);
        const s3CopyExecutor = container.resolve(S3Processor);
        const logger = container.resolve(Logger);

        const putSpy = vi.spyOn(putExecutor, "execute");
        const copySpy = vi.spyOn(s3CopyExecutor, "execute");
        const warnSpy = vi.spyOn(logger, "warn");

        const commands = new Commands();
        const put = PutRecord.create({
            table: "target-table",
            record: { PK: "a", SK: "1" }
        });
        const copy = S3Copy.create({
            sourceBucket: "source-bucket",
            sourceKey: "src/key",
            targetBucket: "target-bucket",
            targetKey: "tgt/key"
        });
        commands.add(put);
        commands.add(copy);
        commands.add({ key: "weird", dedupKey: undefined });

        await processor.execute(commands);

        expect(putSpy).toHaveBeenCalledTimes(1);
        expect(putSpy).toHaveBeenCalledWith([put]);
        expect(copySpy).toHaveBeenCalledTimes(1);
        expect(copySpy).toHaveBeenCalledWith([copy]);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('DdbProcessor does not handle command key "weird"')
        );
    });

    it("calls both executors with empty arrays when Commands is empty and never warns", async () => {
        const container = createDdbContainer();
        const processor = container.resolve(Processor);
        const putExecutor = container.resolve(DdbExecutor);
        const s3CopyExecutor = container.resolve(S3Processor);
        const logger = container.resolve(Logger);

        const putSpy = vi.spyOn(putExecutor, "execute");
        const copySpy = vi.spyOn(s3CopyExecutor, "execute");
        const warnSpy = vi.spyOn(logger, "warn");

        await processor.execute(new Commands());

        expect(putSpy).toHaveBeenCalledTimes(1);
        expect(putSpy).toHaveBeenCalledWith([]);
        expect(copySpy).toHaveBeenCalledTimes(1);
        expect(copySpy).toHaveBeenCalledWith([]);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it("dedupes warnings: the same unknown key across calls only warns once", async () => {
        const container = createDdbContainer();
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
    });

    it("warns again for a NEW unknown key in a later call", async () => {
        const container = createDdbContainer();
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

    it("createContext returns a context carrying the record", () => {
        const container = createDdbContainer();
        const processor = container.resolve(Processor);

        const record = makeRecord("a", "1");
        const ctx = processor.createContext(record);

        expect((ctx as unknown as { record: BaseRecord }).record).toEqual(record);
        expect((ctx as unknown as { record: BaseRecord }).record.PK).toBe("a");
    });

    it("getShardState returns an empty object", () => {
        const container = createDdbContainer();
        const processor = container.resolve(Processor);

        expect(processor.getShardState()).toEqual({});
    });
});

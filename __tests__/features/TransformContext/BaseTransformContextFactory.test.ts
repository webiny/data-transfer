import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../containers/index.ts";
import { BaseTransformContextFactory } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";

interface SampleRecord {
    PK: string;
    SK: string;
    name: string;
}

describe("BaseTransformContextFactory", () => {
    it("resolves from the DI container", () => {
        const container = createDdbContainer();
        const factory = container.resolve(BaseTransformContextFactory);
        expect(typeof factory.create).toBe("function");
    });

    it("creates a context with record, original, modelProvider, cache, addCommand, replace, querySourceRecord", () => {
        const container = createDdbContainer();
        const factory = container.resolve(BaseTransformContextFactory);
        const record: SampleRecord = { PK: "a", SK: "1", name: "alice" };

        const { ctx, commands } = factory.create<SampleRecord>({ record });

        expect(ctx.record).toEqual(record);
        expect(ctx.original).toEqual(record);
        expect(Object.isFrozen(ctx.original)).toBe(true);
        expect(ctx.modelProvider).toBeDefined();
        expect(ctx.cache).toBeDefined();
        expect(typeof ctx.addCommand).toBe("function");
        expect(typeof ctx.replace).toBe("function");
        expect(typeof ctx.querySourceRecord).toBe("function");
        expect(commands.size()).toBe(0);
    });

    it("addCommand pushes to the returned commands bag", () => {
        const container = createDdbContainer();
        const factory = container.resolve(BaseTransformContextFactory);
        const { ctx, commands } = factory.create<SampleRecord>({
            record: { PK: "a", SK: "1", name: "alice" }
        });

        ctx.addCommand(PutRecord.create({ table: "t", record: { PK: "x", SK: "y" } }));

        expect(commands.size()).toBe(1);
        expect(commands.all()).toHaveLength(1);
    });

    it("replace swaps the working record but leaves original frozen", () => {
        const container = createDdbContainer();
        const factory = container.resolve(BaseTransformContextFactory);
        const record: SampleRecord = { PK: "a", SK: "1", name: "alice" };

        const { ctx } = factory.create<SampleRecord>({ record });
        const next: SampleRecord = { PK: "a", SK: "1", name: "bob" };
        ctx.replace(next);

        expect(ctx.record).toEqual(next);
        expect(ctx.original).toEqual(record);
    });

    it("ctx.record is a structuredClone — mutating input does not affect ctx", () => {
        const container = createDdbContainer();
        const factory = container.resolve(BaseTransformContextFactory);
        const record: SampleRecord = { PK: "a", SK: "1", name: "alice" };

        const { ctx } = factory.create<SampleRecord>({ record });
        record.name = "changed-externally";

        expect(ctx.record.name).toBe("alice");
        expect(ctx.original.name).toBe("alice");
    });
});

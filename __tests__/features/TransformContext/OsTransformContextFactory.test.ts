import { describe, it, expect } from "vitest";
import { OsTransformContextFactory } from "../../../src/features/TransformContext/index.ts";
import { PutRecord } from "../../../src/domain/transform/commands/PutRecord.ts";
import { createOsContainer } from "../../containers/index.ts";

describe("OsTransformContextFactory", () => {
    const testRecord = {
        PK: "T#root#L#en-US#CMS#CME#abc",
        SK: "L",
        _et: "CmsEntriesElasticsearch",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: "cms.entry.es",
        title: "Test Entry"
    };

    describe("DI registration", () => {
        it("should resolve from os container", () => {
            const container = createOsContainer();
            const factory = container.resolve(OsTransformContextFactory);
            expect(factory).toBeDefined();
            expect(typeof factory.create).toBe("function");
        });

        it("should return same instance on multiple resolves", () => {
            const container = createOsContainer();
            expect(container.resolve(OsTransformContextFactory)).toBe(
                container.resolve(OsTransformContextFactory)
            );
        });
    });

    describe("create", () => {
        it("should create a context with the record", () => {
            const container = createOsContainer();
            const factory = container.resolve(OsTransformContextFactory);

            const ctx = factory.create({ record: testRecord });

            expect(ctx.record).toEqual(testRecord);
            expect(ctx.original).toEqual(testRecord);
        });

        it("should clone the record (not reference)", () => {
            const container = createOsContainer();
            const factory = container.resolve(OsTransformContextFactory);

            const ctx = factory.create({ record: testRecord });
            ctx.record.title = "Modified";

            expect(ctx.original.title).toBe("Test Entry");
        });

        it("should have empty commands initially", () => {
            const container = createOsContainer();
            const factory = container.resolve(OsTransformContextFactory);

            const ctx = factory.create({ record: testRecord });
            expect(ctx.commands.size()).toBe(0);
        });

        it("should not have copyFile or getFile methods", () => {
            const container = createOsContainer();
            const factory = container.resolve(OsTransformContextFactory);

            const ctx = factory.create({ record: testRecord });
            expect((ctx as any).copyFile).toBeUndefined();
            expect((ctx as any).getFile).toBeUndefined();
        });
    });

    describe("context methods", () => {
        it("putRecord should add a PUT_RECORD command", () => {
            const container = createOsContainer();
            const factory = container.resolve(OsTransformContextFactory);

            const ctx = factory.create({ record: testRecord });
            ctx.putRecord({ PK: "new", SK: "record" });

            expect(ctx.commands.size()).toBe(1);
            expect(ctx.commands.get(PutRecord.key)).toHaveLength(1);
        });

        it("replace should swap the working record", () => {
            const container = createOsContainer();
            const factory = container.resolve(OsTransformContextFactory);

            const ctx = factory.create({ record: testRecord });
            const newRecord = { PK: "new", SK: "new", replaced: true };
            ctx.replace(newRecord);

            expect(ctx.record).toEqual(newRecord);
            expect(ctx.original).toEqual(testRecord);
        });

        it("cache should be shared across contexts", () => {
            const container = createOsContainer();
            const factory = container.resolve(OsTransformContextFactory);

            const ctx1 = factory.create({ record: testRecord });
            ctx1.cache.set("shared-key", "shared-value");

            const ctx2 = factory.create({ record: testRecord });
            expect(ctx2.cache.get("shared-key")).toBe("shared-value");
        });
    });
});

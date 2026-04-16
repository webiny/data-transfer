import { describe, it, expect } from "vitest";
import { DdbTransformContextFactory } from "../../../src/features/TransformContext/index.ts";
import { createDdbContainer } from "../../containers/index.ts";

describe("DdbTransformContextFactory", () => {
    const testRecord = {
        PK: "T#root#L#en-US#CMS#CME#abc",
        SK: "REV#0001",
        _et: "CmsEntries",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: "cms.entry",
        GSI1_PK: "T#root#L#en-US#CMS#CME#abc",
        GSI1_SK: "REV#0001",
        GSI2_PK: "T#root#L#en-US#CMS#CME#abc",
        GSI2_SK: "REV#0001",
        title: "Test Entry"
    };

    describe("DI registration", () => {
        it("should resolve from ddb container", () => {
            const container = createDdbContainer();
            const factory = container.resolve(DdbTransformContextFactory);
            expect(factory).toBeDefined();
            expect(typeof factory.create).toBe("function");
        });

        it("should return same instance on multiple resolves", () => {
            const container = createDdbContainer();
            expect(container.resolve(DdbTransformContextFactory)).toBe(
                container.resolve(DdbTransformContextFactory)
            );
        });
    });

    describe("create", () => {
        it("should create a context with the record", () => {
            const container = createDdbContainer();
            const factory = container.resolve(DdbTransformContextFactory);

            const ctx = factory.create({ record: testRecord });

            expect(ctx.record).toEqual(testRecord);
            expect(ctx.original).toEqual(testRecord);
        });

        it("should clone the record (not reference)", () => {
            const container = createDdbContainer();
            const factory = container.resolve(DdbTransformContextFactory);

            const ctx = factory.create({ record: testRecord });
            ctx.record.title = "Modified";

            expect(ctx.original.title).toBe("Test Entry");
        });

        it("should have empty commands initially", () => {
            const container = createDdbContainer();
            const factory = container.resolve(DdbTransformContextFactory);

            const ctx = factory.create({ record: testRecord });
            expect(ctx.commands).toEqual([]);
        });

        it("should have modelProvider", () => {
            const container = createDdbContainer();
            const factory = container.resolve(DdbTransformContextFactory);

            const ctx = factory.create({ record: testRecord });
            expect(ctx.modelProvider).toBeDefined();
        });

        it("should have cache", () => {
            const container = createDdbContainer();
            const factory = container.resolve(DdbTransformContextFactory);

            const ctx = factory.create({ record: testRecord });
            expect(ctx.cache).toBeDefined();
        });
    });

    describe("context methods", () => {
        it("putRecord should add a PUT_RECORD command", () => {
            const container = createDdbContainer();
            const factory = container.resolve(DdbTransformContextFactory);

            const ctx = factory.create({ record: testRecord });
            ctx.putRecord({ PK: "new", SK: "record" });

            expect(ctx.commands).toHaveLength(1);
            expect(ctx.commands[0].type).toBe("PUT_RECORD");
        });

        it("copyFile should add an S3_COPY command", () => {
            const container = createDdbContainer();
            const factory = container.resolve(DdbTransformContextFactory);

            const ctx = factory.create({ record: testRecord });
            ctx.copyFile("source/key.jpg", "target/key.jpg");

            expect(ctx.commands).toHaveLength(1);
            expect(ctx.commands[0].type).toBe("S3_COPY");
        });

        it("replace should swap the working record", () => {
            const container = createDdbContainer();
            const factory = container.resolve(DdbTransformContextFactory);

            const ctx = factory.create({ record: testRecord });
            const newRecord = { PK: "new", SK: "new", replaced: true };
            ctx.replace(newRecord);

            expect(ctx.record).toEqual(newRecord);
            expect(ctx.original).toEqual(testRecord);
        });

        it("cache should be shared across contexts", () => {
            const container = createDdbContainer();
            const factory = container.resolve(DdbTransformContextFactory);

            const ctx1 = factory.create({ record: testRecord });
            ctx1.cache.set("shared-key", "shared-value");

            const ctx2 = factory.create({ record: testRecord });
            expect(ctx2.cache.get("shared-key")).toBe("shared-value");
        });
    });
});

import { describe, it, expect } from "vitest";
import { TransformPipeline } from "../../../src/domain/transform/Pipeline.ts";
import type { Transformer } from "../../../src/domain/transform/Transformer.ts";
import { PutRecord } from "../../../src/domain/transform/commands/PutRecord.ts";
import { S3Copy } from "../../../src/domain/transform/commands/S3Copy.ts";
import { DdbTransformContextFactory } from "../../../src/features/TransformContext/index.ts";
import { createDdbContainer } from "../../containers/index.ts";

const baseRecord = {
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
    title: "Original"
};

describe("TransformPipeline", () => {
    describe("accepts", () => {
        it("should accept record when no filters", () => {
            const pipeline = new TransformPipeline();
            expect(pipeline.accepts(baseRecord)).toBe(true);
        });

        it("should accept record when all filters pass", () => {
            const pipeline = new TransformPipeline()
                .filter(r => r.TYPE === "cms.entry")
                .filter(r => typeof r.PK === "string");
            expect(pipeline.accepts(baseRecord)).toBe(true);
        });

        it("should reject record when any filter fails", () => {
            const pipeline = new TransformPipeline()
                .filter(r => r.TYPE === "cms.entry")
                .filter(r => r.TYPE === "security.team");
            expect(pipeline.accepts(baseRecord)).toBe(false);
        });
    });

    describe("run", () => {
        it("should return null when record does not pass filters", async () => {
            const container = createDdbContainer();
            const factory = container.resolve(DdbTransformContextFactory);
            const pipeline = new TransformPipeline().filter(r => r.TYPE === "security.team");

            const result = await pipeline.run(baseRecord, factory);
            expect(result).toBeNull();
        });

        it("should run transformers in order and emit PUT_RECORD command", async () => {
            const container = createDdbContainer();
            const factory = container.resolve(DdbTransformContextFactory);

            const setTitle: Transformer = {
                name: "setTitle",
                transform(ctx) {
                    ctx.record.title = "Modified";
                }
            };

            const pipeline = new TransformPipeline().use(setTitle);
            const result = await pipeline.run(baseRecord, factory);

            expect(result).not.toBeNull();
            expect(result!.commands.size()).toBe(1);
            const puts = result!.commands.get<PutRecord>(PutRecord.key);
            expect(puts).toHaveLength(1);
            expect(puts[0].record.title).toBe("Modified");
        });

        it("should emit extra commands from transformers", async () => {
            const container = createDdbContainer();
            const factory = container.resolve(DdbTransformContextFactory);

            const copyFileTransformer: Transformer = {
                name: "copyFile",
                transform(ctx) {
                    (ctx as any).copyFile("src/key.jpg", "tgt/key.jpg");
                }
            };

            const pipeline = new TransformPipeline().use(copyFileTransformer);
            const result = await pipeline.run(baseRecord, factory);

            expect(result!.commands.size()).toBe(2);
            expect(result!.commands.get(PutRecord.key)).toHaveLength(1);
            expect(result!.commands.get(S3Copy.key)).toHaveLength(1);
        });

        it("should call async transformers and await them", async () => {
            const container = createDdbContainer();
            const factory = container.resolve(DdbTransformContextFactory);

            const asyncTransformer: Transformer = {
                name: "async",
                async transform(ctx) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                    ctx.record.asyncFlag = true;
                }
            };

            const pipeline = new TransformPipeline().use(asyncTransformer);
            const result = await pipeline.run(baseRecord, factory);

            const puts = result!.commands.get<PutRecord>(PutRecord.key);
            expect(puts[0].record.asyncFlag).toBe(true);
        });
    });
});

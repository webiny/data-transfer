import { describe, it, expect } from "vitest";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { TransformPipeline } from "~/domain/transform/Pipeline.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { Transformer } from "~/domain/transform/Transformer.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { createDdbContainer, createOsContainer } from "../../containers/index.ts";

function makeRecord(overrides: Partial<BaseRecord> = {}): BaseRecord {
    return {
        PK: "T#root#L#en-US#CMS#CME#abc",
        SK: "REV#0001",
        _et: "CmsEntries",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: "cms.entry",
        ...overrides
    };
}

describe("PipelineRunner Feature", () => {
    describe("DI registration", () => {
        it("should resolve from ddb container", () => {
            const container = createDdbContainer();
            const runner = container.resolve(PipelineRunner);
            expect(runner).toBeDefined();
            expect(typeof runner.register).toBe("function");
            expect(typeof runner.processRecord).toBe("function");
            expect(typeof runner.processAll).toBe("function");
        });

        it("should resolve from os container", () => {
            const container = createOsContainer();
            const runner = container.resolve(PipelineRunner);
            expect(runner).toBeDefined();
        });

        it("should return same instance on multiple resolves", () => {
            const container = createDdbContainer();
            expect(container.resolve(PipelineRunner)).toBe(container.resolve(PipelineRunner));
        });
    });

    describe("processRecord", () => {
        it("should return empty Commands if no pipeline is registered", async () => {
            const container = createDdbContainer();
            const runner = container.resolve(PipelineRunner);
            const commands = await runner.processRecord(makeRecord());
            expect(commands.size()).toBe(0);
        });

        it("should return empty Commands when no pipeline matches", async () => {
            const container = createDdbContainer();
            const runner = container.resolve(PipelineRunner);

            runner.register(new TransformPipeline().filter(r => r.TYPE === "nothing.matches"));

            const commands = await runner.processRecord(makeRecord());
            expect(commands.size()).toBe(0);
        });

        it("should run first matching pipeline", async () => {
            const container = createDdbContainer();
            const runner = container.resolve(PipelineRunner);

            const tagAs: (tag: string) => Transformer = tag => ({
                name: `tag-${tag}`,
                transform(ctx) {
                    ctx.record.tag = tag;
                }
            });

            const first = new TransformPipeline()
                .filter(r => r.TYPE === "cms.entry")
                .use(tagAs("first"));
            const second = new TransformPipeline()
                .filter(r => r.TYPE === "cms.entry")
                .use(tagAs("second"));

            runner.register(first).register(second);

            const commands = await runner.processRecord(makeRecord());
            const puts = commands.get<PutRecord>(PutRecord.key);
            expect(puts).toHaveLength(1);
            expect(puts[0].record.tag).toBe("first");
        });

        it("should propagate exceptions from transformers", async () => {
            const container = createDdbContainer();
            const runner = container.resolve(PipelineRunner);

            const bad: Transformer = {
                name: "bad",
                transform() {
                    throw new Error("boom");
                }
            };

            runner.register(new TransformPipeline().filter(r => r.TYPE === "cms.entry").use(bad));

            await expect(runner.processRecord(makeRecord())).rejects.toThrow("boom");
        });
    });

    describe("processAll", () => {
        it("should merge commands from all records", async () => {
            const container = createDdbContainer();
            const runner = container.resolve(PipelineRunner);

            runner.register(new TransformPipeline().filter(r => r.TYPE === "cms.entry"));

            const commands = await runner.processAll([
                makeRecord({ PK: "a" }),
                makeRecord({ PK: "b" }),
                makeRecord({ PK: "c" })
            ]);

            expect(commands.get(PutRecord.key)).toHaveLength(3);
        });

        it("should return empty Commands for empty input", async () => {
            const container = createDdbContainer();
            const runner = container.resolve(PipelineRunner);
            const commands = await runner.processAll([]);
            expect(commands.size()).toBe(0);
        });

        it("should skip records with no matching pipeline but include matches", async () => {
            const container = createDdbContainer();
            const runner = container.resolve(PipelineRunner);

            runner.register(new TransformPipeline().filter(r => r.TYPE === "cms.entry"));

            const commands = await runner.processAll([
                makeRecord({ PK: "a", TYPE: "cms.entry" }),
                makeRecord({ PK: "b", TYPE: "other.type" }),
                makeRecord({ PK: "c", TYPE: "cms.entry" })
            ]);

            expect(commands.get(PutRecord.key)).toHaveLength(2);
        });
    });
});

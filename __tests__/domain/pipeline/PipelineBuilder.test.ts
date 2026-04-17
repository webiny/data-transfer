import { describe, it, expect } from "vitest";
import type { Abstraction } from "@webiny/di";
import {
    PipelineBuilder,
    Pipeline,
    Scanner,
    Processor,
    Hook,
    createFilter
} from "~/domain/pipeline/index.ts";
import { FakeTransformer } from "./fixtures/fakes.ts";
import type { FakeRecord, FakeContext, FakeShard } from "./fixtures/types.ts";

describe("PipelineBuilder — construction and build()", () => {
    it("produces a Pipeline with the configured name, tokens, and filter", () => {
        const matchAll = createFilter<FakeRecord>(() => true);

        const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "basic",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        })
            .filter(matchAll)
            .build();

        expect(pipeline).toBeInstanceOf(Pipeline);
        expect(pipeline.name).toBe("basic");
        expect(pipeline.scannerToken).toBe(Scanner);
        expect(pipeline.processorToken).toBe(Processor);
        expect(pipeline.beforeHookTokens).toEqual([]);
        expect(pipeline.afterHookTokens).toEqual([]);
        expect(pipeline.hasFilter).toBe(true);
    });

    it("throws when name is empty", () => {
        expect(
            () =>
                new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
                    name: "",
                    scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
                    processor: Processor as Abstraction<
                        Processor.Interface<FakeRecord, FakeContext>
                    >
                })
        ).toThrow(/name/i);
    });

    it("throws when name is whitespace-only", () => {
        expect(
            () =>
                new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
                    name: "   ",
                    scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
                    processor: Processor as Abstraction<
                        Processor.Interface<FakeRecord, FakeContext>
                    >
                })
        ).toThrow(/name/i);
    });

    it("throws when build() is called without .filter()", () => {
        const builder = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "no-filter",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });

        expect(() => builder.build()).toThrow(/filter/i);
    });
});

describe("PipelineBuilder.filter() — extended rules", () => {
    it("accepts a single Filter and routes records correctly via accepts()", () => {
        const isFoo = createFilter<FakeRecord>(r => r.type === "foo");

        const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "single-filter",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        })
            .filter(isFoo)
            .build();

        expect(pipeline.hasFilter).toBe(true);
        expect(pipeline.accepts({ id: "a", type: "foo" })).toBe(true);
        expect(pipeline.accepts({ id: "b", type: "bar" })).toBe(false);
    });

    it("accepts an array of Filters and AND-combines them in order", () => {
        const isFoo = createFilter<FakeRecord>(r => r.type === "foo");
        const notDeleted = createFilter<FakeRecord>(r => r.payload?.deleted !== true);

        const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "array-filter",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        })
            .filter([isFoo, notDeleted])
            .build();

        expect(pipeline.accepts({ id: "a", type: "foo" })).toBe(true);
        expect(pipeline.accepts({ id: "b", type: "bar" })).toBe(false);
        expect(pipeline.accepts({ id: "c", type: "foo", payload: { deleted: true } })).toBe(false);
    });

    it("throws when .filter() is called a second time on the same builder", () => {
        const isFoo = createFilter<FakeRecord>(r => r.type === "foo");
        const isBar = createFilter<FakeRecord>(r => r.type === "bar");

        const builder = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "double-filter",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        }).filter(isFoo);

        expect(() => builder.filter(isBar)).toThrow(/\.filter\(\).*already called/i);
    });

    it("throws when .filter() receives an empty array", () => {
        const builder = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "empty-array",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });

        expect(() => builder.filter([])).toThrow(/empty/i);
    });

    it("when .filter() is double-called with an empty array, throws the double-call error first (not empty-array)", () => {
        const isFoo = createFilter<FakeRecord>(r => r.type === "foo");
        const builder = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "guard-order",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        }).filter(isFoo);

        expect(() => builder.filter([])).toThrow(/\.filter\(\).*already called/i);
        expect(() => builder.filter([])).not.toThrow(/empty/i);
    });
});

describe("PipelineBuilder.use()", () => {
    it("chains the same transformer token twice and exposes both via transformerTokens", () => {
        const matchAll = createFilter<FakeRecord>(() => true);

        const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "with-transformers",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        })
            .filter(matchAll)
            .use(FakeTransformer)
            .use(FakeTransformer)
            .build();

        expect(pipeline.transformerTokens).toHaveLength(2);
        expect(pipeline.transformerTokens[0]).toBe(FakeTransformer);
        expect(pipeline.transformerTokens[1]).toBe(FakeTransformer);
    });

    it("returns the builder for chaining", () => {
        const builder = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "chain",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });
        expect(builder.use(FakeTransformer)).toBe(builder);
    });
});

describe("PipelineBuilder — hook registration", () => {
    it("registers before-hooks in declaration order", () => {
        const matchAll = createFilter<FakeRecord>(() => true);
        const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "before-hooks",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        })
            .filter(matchAll)
            .beforeExecuteCommands(Hook)
            .beforeExecuteCommands(Hook)
            .build();

        expect(pipeline.beforeHookTokens).toHaveLength(2);
        expect(pipeline.beforeHookTokens[0]).toBe(Hook);
        expect(pipeline.beforeHookTokens[1]).toBe(Hook);
    });

    it("registers after-hooks in declaration order", () => {
        const matchAll = createFilter<FakeRecord>(() => true);
        const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "after-hooks",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        })
            .filter(matchAll)
            .afterExecuteCommands(Hook)
            .afterExecuteCommands(Hook)
            .build();

        expect(pipeline.afterHookTokens).toHaveLength(2);
    });

    it("keeps before and after hook lists independent", () => {
        const matchAll = createFilter<FakeRecord>(() => true);
        const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "mixed-hooks",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        })
            .filter(matchAll)
            .beforeExecuteCommands(Hook)
            .afterExecuteCommands(Hook)
            .afterExecuteCommands(Hook)
            .build();

        expect(pipeline.beforeHookTokens).toHaveLength(1);
        expect(pipeline.afterHookTokens).toHaveLength(2);
    });
});

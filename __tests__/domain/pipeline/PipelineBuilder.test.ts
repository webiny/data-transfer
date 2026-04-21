import { describe, it, expect } from "vitest";
import type { Abstraction } from "@webiny/di";
import {
    PipelineBuilder,
    Pipeline,
    Scanner,
    Processor,
    Hook,
    createFilter,
    type Transformer
} from "~/domain/pipeline/index.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { tagTransformer } from "./fixtures/fakes.ts";
import type { FakeRecord, FakeContext, FakeShard } from "./fixtures/types.ts";

type ProcessorToken = Abstraction<
    Processor.Interface<BaseTransformContext.Interface<FakeRecord>, any>
>;

function makeBuilder(
    name: string,
    processors: readonly ProcessorToken[] = [Processor as ProcessorToken]
): PipelineBuilder<FakeRecord, FakeContext, FakeShard> {
    return new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
        name,
        scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
        processors
    });
}

describe("PipelineBuilder — construction and build()", () => {
    it("produces a Pipeline with the configured name, scanner/processor tokens, and filter", () => {
        const matchAll = createFilter<FakeRecord>(() => true);

        const pipeline = makeBuilder("basic").filter(matchAll).build();

        expect(pipeline).toBeInstanceOf(Pipeline);
        expect(pipeline.name).toBe("basic");
        expect(pipeline.scannerToken).toBe(Scanner);
        expect(pipeline.processorTokens).toEqual([Processor]);
        expect(pipeline.beforeHookTokens).toEqual([]);
        expect(pipeline.afterHookTokens).toEqual([]);
        expect(pipeline.hasFilter).toBe(true);
    });

    it("throws when name is empty", () => {
        expect(() => makeBuilder("")).toThrow(/name/i);
    });

    it("throws when name is whitespace-only", () => {
        expect(() => makeBuilder("   ")).toThrow(/name/i);
    });

    it("builds a pipeline that accepts every record when .filter() was never called (pure-passthrough)", () => {
        const pipeline = makeBuilder("no-filter").build();

        expect(pipeline.hasFilter).toBe(false);
        expect(pipeline.accepts({ id: "r1", type: "anything" })).toBe(true);
        expect(pipeline.accepts({ id: "r2", type: "else" })).toBe(true);
    });
});

describe("PipelineBuilder.filter() — extended rules", () => {
    it("accepts a single Filter and routes records correctly via accepts()", () => {
        const isFoo = createFilter<FakeRecord>(r => r.type === "foo");

        const pipeline = makeBuilder("single-filter").filter(isFoo).build();

        expect(pipeline.hasFilter).toBe(true);
        expect(pipeline.accepts({ id: "a", type: "foo" })).toBe(true);
        expect(pipeline.accepts({ id: "b", type: "bar" })).toBe(false);
    });

    it("AND-combines multiple filters via chained .filter() calls in declaration order", () => {
        const isFoo = createFilter<FakeRecord>(r => r.type === "foo");
        const notDeleted = createFilter<FakeRecord>(r => r.payload?.deleted !== true);

        const pipeline = makeBuilder("chained-filters").filter(isFoo).filter(notDeleted).build();

        expect(pipeline.accepts({ id: "a", type: "foo" })).toBe(true);
        expect(pipeline.accepts({ id: "b", type: "bar" })).toBe(false);
        expect(pipeline.accepts({ id: "c", type: "foo", payload: { deleted: true } })).toBe(false);
    });

    it("accumulates filters across multiple .filter() calls (declaration order)", () => {
        const seen: string[] = [];
        const filterA = createFilter<FakeRecord>(() => {
            seen.push("a");
            return true;
        });
        const filterB = createFilter<FakeRecord>(() => {
            seen.push("b");
            return true;
        });

        const pipeline = makeBuilder("accumulate").filter(filterA).filter(filterB).build();

        expect(pipeline.hasFilter).toBe(true);
        expect(pipeline.accepts({ id: "r1", type: "x" })).toBe(true);
        expect(seen).toEqual(["a", "b"]);
    });

    it("preserves transformer insertion order regardless of where .filter() calls appear", () => {
        const t1 = (() => undefined) as Transformer.Interface<FakeContext>;
        const t2 = (() => undefined) as Transformer.Interface<FakeContext>;
        const t3 = (() => undefined) as Transformer.Interface<FakeContext>;
        const filterA = createFilter<FakeRecord>(() => true);
        const filterB = createFilter<FakeRecord>(() => true);

        const pipeline = makeBuilder("interleaved")
            .use(t1)
            .filter(filterA)
            .use(t2)
            .filter(filterB)
            .use(t3)
            .build();

        expect(pipeline.transformerFns).toEqual([t1, t2, t3]);
        expect(pipeline.hasFilter).toBe(true);
        expect(pipeline.accepts({ id: "r", type: "x" })).toBe(true);
    });
});

describe("PipelineBuilder.use()", () => {
    it("chains the same transformer function twice and exposes both via transformerFns", () => {
        const matchAll = createFilter<FakeRecord>(() => true);

        const pipeline = makeBuilder("with-transformers")
            .filter(matchAll)
            .use(tagTransformer)
            .use(tagTransformer)
            .build();

        expect(pipeline.transformerFns).toHaveLength(2);
        expect(pipeline.transformerFns[0]).toBe(tagTransformer);
        expect(pipeline.transformerFns[1]).toBe(tagTransformer);
    });

    it("returns the builder for chaining", () => {
        const builder = makeBuilder("chain");
        expect(builder.use(tagTransformer)).toBe(builder);
    });
});

describe("PipelineBuilder — hook registration", () => {
    it("registers before-hooks in declaration order", () => {
        const matchAll = createFilter<FakeRecord>(() => true);
        const pipeline = makeBuilder("before-hooks")
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
        const pipeline = makeBuilder("after-hooks")
            .filter(matchAll)
            .afterExecuteCommands(Hook)
            .afterExecuteCommands(Hook)
            .build();

        expect(pipeline.afterHookTokens).toHaveLength(2);
    });

    it("keeps before and after hook lists independent", () => {
        const matchAll = createFilter<FakeRecord>(() => true);
        const pipeline = makeBuilder("mixed-hooks")
            .filter(matchAll)
            .beforeExecuteCommands(Hook)
            .afterExecuteCommands(Hook)
            .afterExecuteCommands(Hook)
            .build();

        expect(pipeline.beforeHookTokens).toHaveLength(1);
        expect(pipeline.afterHookTokens).toHaveLength(2);
    });
});

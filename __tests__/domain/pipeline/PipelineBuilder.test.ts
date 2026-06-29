import { describe, it, expect } from "vitest";
import {
    PipelineBuilder,
    Pipeline,
    Processor,
    Hook,
    createFilter,
    type Transformer
} from "~/domain/pipeline/index.ts";
import { FakeProcessor, FakeScanner, tagTransformer } from "./fixtures/fakes.ts";
import type { FakeRecord, FakeContext, FakeShard } from "./fixtures/types.ts";

const fakeProcessor = new FakeProcessor();
const fakeScanner = new FakeScanner();

function makeBuilder(
    name: string,
    processors: readonly Processor.Interface<any, any>[] = [fakeProcessor]
): PipelineBuilder<FakeRecord, FakeContext, FakeShard> {
    return new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
        name,
        scanner: fakeScanner,
        processors,
        customizers: []
    });
}

describe("PipelineBuilder — construction and build()", () => {
    it("produces a Pipeline with the configured name, scanner/processor tokens, and filter", async () => {
        const matchAll = createFilter<FakeRecord>(() => true);

        const pipeline = await makeBuilder("basic").filter(matchAll).build();

        expect(pipeline).toBeInstanceOf(Pipeline);
        expect(pipeline.name).toBe("basic");
        expect(pipeline.scanner).toBe(fakeScanner);
        expect(pipeline.processors).toEqual([fakeProcessor]);
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

    it("builds a pipeline that accepts every record when .filter() was never called (pure-passthrough)", async () => {
        const pipeline = await makeBuilder("no-filter").build();

        expect(pipeline.hasFilter).toBe(false);
        expect(await pipeline.accepts({ id: "r1", type: "anything" })).toBe(true);
        expect(await pipeline.accepts({ id: "r2", type: "else" })).toBe(true);
    });
});

describe("PipelineBuilder.filter() — extended rules", () => {
    it("accepts a single Filter and routes records correctly via accepts()", async () => {
        const isFoo = createFilter<FakeRecord>(r => r.type === "foo");

        const pipeline = await makeBuilder("single-filter").filter(isFoo).build();

        expect(pipeline.hasFilter).toBe(true);
        expect(await pipeline.accepts({ id: "a", type: "foo" })).toBe(true);
        expect(await pipeline.accepts({ id: "b", type: "bar" })).toBe(false);
    });

    it("AND-combines multiple filters via chained .filter() calls in declaration order", async () => {
        const isFoo = createFilter<FakeRecord>(r => r.type === "foo");
        const notDeleted = createFilter<FakeRecord>(r => r.payload?.deleted !== true);

        const pipeline = await makeBuilder("chained-filters")
            .filter(isFoo)
            .filter(notDeleted)
            .build();

        expect(await pipeline.accepts({ id: "a", type: "foo" })).toBe(true);
        expect(await pipeline.accepts({ id: "b", type: "bar" })).toBe(false);
        expect(await pipeline.accepts({ id: "c", type: "foo", payload: { deleted: true } })).toBe(
            false
        );
    });

    it("accumulates filters across multiple .filter() calls (declaration order)", async () => {
        const seen: string[] = [];
        const filterA = createFilter<FakeRecord>(() => {
            seen.push("a");
            return true;
        });
        const filterB = createFilter<FakeRecord>(() => {
            seen.push("b");
            return true;
        });

        const pipeline = await makeBuilder("accumulate").filter(filterA).filter(filterB).build();

        expect(pipeline.hasFilter).toBe(true);
        expect(await pipeline.accepts({ id: "r1", type: "x" })).toBe(true);
        expect(seen).toEqual(["a", "b"]);
    });

    it("preserves transformer insertion order regardless of where .filter() calls appear", async () => {
        const t1 = (() => undefined) as Transformer.Interface<FakeContext>;
        const t2 = (() => undefined) as Transformer.Interface<FakeContext>;
        const t3 = (() => undefined) as Transformer.Interface<FakeContext>;
        const filterA = createFilter<FakeRecord>(() => true);
        const filterB = createFilter<FakeRecord>(() => true);

        const pipeline = await makeBuilder("interleaved")
            .use(t1)
            .filter(filterA)
            .use(t2)
            .filter(filterB)
            .use(t3)
            .build();

        expect(pipeline.transformerFns).toEqual([t1, t2, t3]);
        expect(pipeline.hasFilter).toBe(true);
        expect(await pipeline.accepts({ id: "r", type: "x" })).toBe(true);
    });
});

describe("PipelineBuilder.use()", () => {
    it("chains the same transformer function twice and exposes both via transformerFns", async () => {
        const matchAll = createFilter<FakeRecord>(() => true);

        const pipeline = await makeBuilder("with-transformers")
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

    it("accepts an array of transformers and appends them in order", async () => {
        const t1 = (() => undefined) as Transformer.Interface<FakeContext>;
        const t2 = (() => undefined) as Transformer.Interface<FakeContext>;
        const t3 = (() => undefined) as Transformer.Interface<FakeContext>;
        const stack = [t1, t2, t3] as const;

        const pipeline = await makeBuilder("array-stack").use(stack).build();

        expect(pipeline.transformerFns).toEqual([t1, t2, t3]);
    });

    it("treats an empty array as a no-op", async () => {
        const pipeline = await makeBuilder("empty-array").use([]).build();
        expect(pipeline.transformerFns).toHaveLength(0);
    });

    it("supports mixing single and array calls, preserving insertion order", async () => {
        const t1 = (() => undefined) as Transformer.Interface<FakeContext>;
        const t2 = (() => undefined) as Transformer.Interface<FakeContext>;
        const t3 = (() => undefined) as Transformer.Interface<FakeContext>;
        const t4 = (() => undefined) as Transformer.Interface<FakeContext>;

        const pipeline = await makeBuilder("mixed").use(t1).use([t2, t3]).use(t4).build();

        expect(pipeline.transformerFns).toEqual([t1, t2, t3, t4]);
    });
});

describe("PipelineBuilder — hook registration", () => {
    it("registers before-hooks in declaration order", async () => {
        const matchAll = createFilter<FakeRecord>(() => true);
        const pipeline = await makeBuilder("before-hooks")
            .filter(matchAll)
            .beforeExecuteCommands(Hook)
            .beforeExecuteCommands(Hook)
            .build();

        expect(pipeline.beforeHookTokens).toHaveLength(2);
        expect(pipeline.beforeHookTokens[0]).toBe(Hook);
        expect(pipeline.beforeHookTokens[1]).toBe(Hook);
    });

    it("registers after-hooks in declaration order", async () => {
        const matchAll = createFilter<FakeRecord>(() => true);
        const pipeline = await makeBuilder("after-hooks")
            .filter(matchAll)
            .afterExecuteCommands(Hook)
            .afterExecuteCommands(Hook)
            .build();

        expect(pipeline.afterHookTokens).toHaveLength(2);
    });

    it("keeps before and after hook lists independent", async () => {
        const matchAll = createFilter<FakeRecord>(() => true);
        const pipeline = await makeBuilder("mixed-hooks")
            .filter(matchAll)
            .beforeExecuteCommands(Hook)
            .afterExecuteCommands(Hook)
            .afterExecuteCommands(Hook)
            .build();

        expect(pipeline.beforeHookTokens).toHaveLength(1);
        expect(pipeline.afterHookTokens).toHaveLength(2);
    });
});

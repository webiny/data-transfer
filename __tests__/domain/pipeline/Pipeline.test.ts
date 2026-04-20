import { describe, it, expect } from "vitest";
import type { Abstraction } from "@webiny/di";
import { Pipeline, Scanner, Processor, createFilter } from "~/domain/pipeline/index.ts";
import type { PipelineConfig } from "~/domain/pipeline/Pipeline.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { tagTransformer } from "./fixtures/fakes.ts";
import type { FakeRecord, FakeContext, FakeShard } from "./fixtures/types.ts";

type ProcessorToken = Abstraction<
    Processor.Interface<BaseTransformContext.Interface<FakeRecord>, any>
>;

function baseConfig(
    overrides: Partial<PipelineConfig<FakeRecord, FakeContext, FakeShard>> = {}
): PipelineConfig<FakeRecord, FakeContext, FakeShard> {
    return {
        name: "test-pipeline",
        scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
        processors: [Processor as ProcessorToken],
        filters: [],
        transformers: [],
        beforeHooks: [],
        afterHooks: [],
        ...overrides
    };
}

describe("Pipeline — construction + getters", () => {
    it("exposes name, scanner/processor tokens, and empty hook lists", () => {
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(
            baseConfig({ name: "exposes-tokens", transformers: [tagTransformer] })
        );

        expect(pipeline.name).toBe("exposes-tokens");
        expect(pipeline.scannerToken).toBe(Scanner);
        expect(pipeline.processorTokens).toEqual([Processor]);
        expect(pipeline.beforeHookTokens).toEqual([]);
        expect(pipeline.afterHookTokens).toEqual([]);
    });

    it("exposes transformerFns in registration order", () => {
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(
            baseConfig({ transformers: [tagTransformer, tagTransformer] })
        );

        expect(pipeline.transformerFns).toHaveLength(2);
        expect(pipeline.transformerFns[0]).toBe(tagTransformer);
        expect(pipeline.transformerFns[1]).toBe(tagTransformer);
    });

    it("reports hasFilter=false when filters array is empty", () => {
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(baseConfig());
        expect(pipeline.hasFilter).toBe(false);
    });

    it("reports hasFilter=true when at least one filter exists", () => {
        const filter = createFilter<FakeRecord>(r => r.type === "foo");
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(
            baseConfig({ filters: [filter] })
        );
        expect(pipeline.hasFilter).toBe(true);
    });
});

describe("Pipeline.accepts()", () => {
    it("returns true when no filters are present", () => {
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(baseConfig());
        expect(pipeline.accepts({ id: "x", type: "foo" })).toBe(true);
    });

    it("returns true only when every filter passes", () => {
        const isFoo = createFilter<FakeRecord>(r => r.type === "foo");
        const notDeleted = createFilter<FakeRecord>(r => r.payload?.deleted !== true);
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(
            baseConfig({ filters: [isFoo, notDeleted] })
        );

        expect(pipeline.accepts({ id: "a", type: "foo" })).toBe(true);
        expect(pipeline.accepts({ id: "b", type: "bar" })).toBe(false);
        expect(pipeline.accepts({ id: "c", type: "foo", payload: { deleted: true } })).toBe(false);
    });

    it("short-circuits on first failing filter", () => {
        const calls: string[] = [];
        const first = createFilter<FakeRecord>(r => {
            calls.push(`first:${r.id}`);
            return false;
        });
        const second = createFilter<FakeRecord>(r => {
            calls.push(`second:${r.id}`);
            return true;
        });
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(
            baseConfig({ filters: [first, second] })
        );

        expect(pipeline.accepts({ id: "r1", type: "x" })).toBe(false);
        expect(calls).toEqual(["first:r1"]);
    });
});

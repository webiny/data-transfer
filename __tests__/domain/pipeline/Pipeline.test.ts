import { describe, it, expect } from "vitest";
import type { Abstraction } from "@webiny/di";
import { Pipeline, Scanner, Processor, createFilter } from "~/domain/pipeline/index.ts";
import type { PipelineConfig } from "~/domain/pipeline/Pipeline.ts";
import { FakeTransformer } from "./fixtures/fakes.ts";
import type { FakeRecord, FakeContext, FakeShard } from "./fixtures/types.ts";

function baseConfig(
    overrides: Partial<PipelineConfig<FakeRecord, FakeContext, FakeShard>> = {}
): PipelineConfig<FakeRecord, FakeContext, FakeShard> {
    return {
        name: "test-pipeline",
        scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
        processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>,
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
            baseConfig({ name: "exposes-tokens", transformers: [FakeTransformer] })
        );

        expect(pipeline.name).toBe("exposes-tokens");
        expect(pipeline.scannerToken).toBe(Scanner);
        expect(pipeline.processorToken).toBe(Processor);
        expect(pipeline.beforeHookTokens).toEqual([]);
        expect(pipeline.afterHookTokens).toEqual([]);
    });

    it("exposes transformerTokens in registration order", () => {
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(
            baseConfig({ transformers: [FakeTransformer, FakeTransformer] })
        );

        expect(pipeline.transformerTokens).toHaveLength(2);
        expect(pipeline.transformerTokens[0]).toBe(FakeTransformer);
        expect(pipeline.transformerTokens[1]).toBe(FakeTransformer);
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

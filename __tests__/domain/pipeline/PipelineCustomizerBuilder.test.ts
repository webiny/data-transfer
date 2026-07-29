import { describe, it, expect } from "vitest";
import { PipelineCustomizerBuilder } from "~/domain/pipeline/PipelineCustomizerBuilder.js";
import { createFilter } from "~/domain/pipeline/Filter.js";

describe("PipelineCustomizerBuilder", () => {
    it("accumulates filters", () => {
        const builder = new PipelineCustomizerBuilder();
        const f1 = createFilter(() => true);
        const f2 = createFilter(() => false);
        builder.filter(f1).filter(f2);
        expect(builder.getFilters()).toEqual([f1, f2]);
    });

    it("accumulates transformers (single)", () => {
        const t1 = async () => {};
        const builder = new PipelineCustomizerBuilder();
        builder.use(t1);
        expect(builder.getTransformers()).toEqual([t1]);
    });

    it("accumulates transformers (array)", () => {
        const t1 = async () => {};
        const t2 = async () => {};
        const builder = new PipelineCustomizerBuilder();
        builder.use([t1, t2]);
        expect(builder.getTransformers()).toEqual([t1, t2]);
    });

    it("is chainable", () => {
        const builder = new PipelineCustomizerBuilder();
        const result = builder.filter(createFilter(() => true)).use(async () => {});
        expect(result).toBe(builder);
    });

    it("starts empty", () => {
        const builder = new PipelineCustomizerBuilder();
        expect(builder.getFilters()).toEqual([]);
        expect(builder.getTransformers()).toEqual([]);
    });
});

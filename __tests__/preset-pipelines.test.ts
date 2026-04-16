import { describe, it, expect } from "vitest";
import { CmsEntryPipeline } from "../src/presets/v5-to-v6/CmsEntryPipeline";
import { CmsModelPipeline } from "../src/presets/v5-to-v6/CmsModelPipeline";
import { FmFilePipeline } from "../src/presets/v5-to-v6/FmFilePipeline";

describe("Preset Pipelines", () => {
    describe("CmsModelPipeline", () => {
        it("should accept cms.model records", () => {
            const pipeline = new CmsModelPipeline().build();
            const record = { TYPE: "cms.model", modelId: "blogPost" };

            expect(pipeline.accepts(record)).toBe(true);
        });

        it("should reject non-cms.model records", () => {
            const pipeline = new CmsModelPipeline().build();
            const record = { TYPE: "cms.entry", modelId: "blogPost" };

            expect(pipeline.accepts(record)).toBe(false);
        });

        it("should allow adding custom filters", () => {
            const pipeline = new CmsModelPipeline()
                .filter(record => record.modelId === "blogPost")
                .build();

            expect(pipeline.accepts({ TYPE: "cms.model", modelId: "blogPost" })).toBe(true);
            expect(pipeline.accepts({ TYPE: "cms.model", modelId: "page" })).toBe(false);
        });
    });

    describe("CmsEntryPipeline", () => {
        it("should accept cms.entry records", () => {
            const pipeline = new CmsEntryPipeline().build();
            const record = { TYPE: "cms.entry", modelId: "blogPost" };

            expect(pipeline.accepts(record)).toBe(true);
        });

        it("should accept cms.entry.l records", () => {
            const pipeline = new CmsEntryPipeline().build();
            const record = { TYPE: "cms.entry.l", modelId: "blogPost" };

            expect(pipeline.accepts(record)).toBe(true);
        });

        it("should accept cms.entry.p records", () => {
            const pipeline = new CmsEntryPipeline().build();
            const record = { TYPE: "cms.entry.p", modelId: "blogPost" };

            expect(pipeline.accepts(record)).toBe(true);
        });

        it("should reject non-cms.entry records", () => {
            const pipeline = new CmsEntryPipeline().build();
            const record = { TYPE: "cms.model", modelId: "blogPost" };

            expect(pipeline.accepts(record)).toBe(false);
        });

        it("should allow adding custom filters", () => {
            const pipeline = new CmsEntryPipeline()
                .filter(record => record.modelId === "blogPost")
                .build();

            expect(pipeline.accepts({ TYPE: "cms.entry.l", modelId: "blogPost" })).toBe(true);
            expect(pipeline.accepts({ TYPE: "cms.entry.l", modelId: "page" })).toBe(false);
        });

        it("should allow adding custom transformers", () => {
            const customTransformer = {
                name: "customTransformer",
                transform: () => {}
            };

            const pipeline = new CmsEntryPipeline().use(customTransformer).build();

            expect(pipeline).toBeDefined();
            // Pipeline should still accept cms.entry records
            expect(pipeline.accepts({ TYPE: "cms.entry.l", modelId: "test" })).toBe(true);
        });
    });

    describe("FmFilePipeline", () => {
        it("should accept fmFile records", () => {
            const pipeline = new FmFilePipeline().build();
            const record = { TYPE: "cms.entry.l", modelId: "fmFile" };

            expect(pipeline.accepts(record)).toBe(true);
        });

        it("should accept wbyFmFile records", () => {
            const pipeline = new FmFilePipeline().build();
            const record = { TYPE: "cms.entry.l", modelId: "wbyFmFile" };

            expect(pipeline.accepts(record)).toBe(true);
        });

        it("should reject non-file records", () => {
            const pipeline = new FmFilePipeline().build();
            const record = { TYPE: "cms.entry.l", modelId: "blogPost" };

            expect(pipeline.accepts(record)).toBe(false);
        });

        it("should allow adding custom transformers", () => {
            const customTransformer = {
                name: "customTransformer",
                transform: () => {}
            };

            const pipeline = new FmFilePipeline().use(customTransformer).build();

            expect(pipeline).toBeDefined();
            // Pipeline should still accept fmFile records
            expect(pipeline.accepts({ TYPE: "cms.entry.l", modelId: "fmFile" })).toBe(true);
        });
    });
});

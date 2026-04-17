import { describe, it, expect } from "vitest";
import { CmsEntryPipeline } from "~/presets/v5-to-v6/CmsEntryPipeline.ts";
import { CmsModelPipeline } from "~/presets/v5-to-v6/CmsModelPipeline.ts";
import { FmFilePipeline } from "~/presets/v5-to-v6/FmFilePipeline.ts";

describe("Preset Pipelines", () => {
    describe("CmsModelPipeline", () => {
        it("should accept cms.model records", () => {
            const pipeline = new CmsModelPipeline().build();
            expect(pipeline.accepts({ TYPE: "cms.model", modelId: "blogPost" })).toBe(true);
        });

        it("should reject non-cms.model records", () => {
            const pipeline = new CmsModelPipeline().build();
            expect(pipeline.accepts({ TYPE: "cms.entry", modelId: "blogPost" })).toBe(false);
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
            expect(pipeline.accepts({ TYPE: "cms.entry", modelId: "blogPost" })).toBe(true);
        });

        it("should accept cms.entry.l records", () => {
            const pipeline = new CmsEntryPipeline().build();
            expect(pipeline.accepts({ TYPE: "cms.entry.l", modelId: "blogPost" })).toBe(true);
        });

        it("should accept cms.entry.p records", () => {
            const pipeline = new CmsEntryPipeline().build();
            expect(pipeline.accepts({ TYPE: "cms.entry.p", modelId: "blogPost" })).toBe(true);
        });

        it("should reject non-cms.entry records", () => {
            const pipeline = new CmsEntryPipeline().build();
            expect(pipeline.accepts({ TYPE: "cms.model", modelId: "blogPost" })).toBe(false);
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
            expect(pipeline.accepts({ TYPE: "cms.entry.l", modelId: "test" })).toBe(true);
        });
    });

    describe("FmFilePipeline", () => {
        it("should accept fmFile records", () => {
            const pipeline = new FmFilePipeline().build();
            expect(pipeline.accepts({ TYPE: "cms.entry.l", modelId: "fmFile" })).toBe(true);
        });

        it("should accept wbyFmFile records", () => {
            const pipeline = new FmFilePipeline().build();
            expect(pipeline.accepts({ TYPE: "cms.entry.l", modelId: "wbyFmFile" })).toBe(true);
        });

        it("should reject non-file records", () => {
            const pipeline = new FmFilePipeline().build();
            expect(pipeline.accepts({ TYPE: "cms.entry.l", modelId: "blogPost" })).toBe(false);
        });

        it("should allow adding custom transformers", () => {
            const customTransformer = {
                name: "customTransformer",
                transform: () => {}
            };

            const pipeline = new FmFilePipeline().use(customTransformer).build();
            expect(pipeline).toBeDefined();
            expect(pipeline.accepts({ TYPE: "cms.entry.l", modelId: "fmFile" })).toBe(true);
        });
    });
});

import { describe, it, expect } from "vitest";
import { PipelineBuilder } from "../../../src/domain/transform/PipelineBuilder.ts";
import { TransformPipeline } from "../../../src/domain/transform/Pipeline.ts";
import type { Transformer } from "../../../src/domain/transform/Transformer.ts";
import { DdbTransformContextFactory } from "../../../src/features/TransformContext/index.ts";
import { createDdbContainer } from "../../containers/index.ts";

describe("PipelineBuilder", () => {
    it("should build a TransformPipeline", () => {
        const pipeline = new PipelineBuilder().build();
        expect(pipeline).toBeInstanceOf(TransformPipeline);
    });

    it("should chain filter and use calls", () => {
        const transformer: Transformer = {
            name: "noop",
            transform() {}
        };

        const pipeline = new PipelineBuilder()
            .filter(r => r.TYPE === "cms.entry")
            .use(transformer)
            .build();

        expect(pipeline).toBeInstanceOf(TransformPipeline);
    });

    it("should support subclassing", async () => {
        class CustomPipeline extends PipelineBuilder {
            public constructor() {
                super();
                this.filter(r => r.TYPE === "cms.entry");
                this.use({
                    name: "tag",
                    transform(ctx) {
                        ctx.record.tagged = true;
                    }
                });
            }
        }

        const container = createDdbContainer();
        const factory = container.resolve(DdbTransformContextFactory);
        const pipeline = new CustomPipeline().build();

        const record = {
            PK: "T#root#L#en-US#CMS#CME#abc",
            SK: "REV#0001",
            _et: "CmsEntries",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z",
            TYPE: "cms.entry",
            GSI1_PK: "x",
            GSI1_SK: "x",
            GSI2_PK: "x",
            GSI2_SK: "x"
        };

        const result = await pipeline.run(record, factory);
        expect((result!.commands[0] as any).record.tagged).toBe(true);
    });
});

import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../containers/index.ts";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/abstractions/PipelineBuilderFactory.js";
import { DdbScanner } from "~/features/DdbScanner/index.js";
import { DdbProcessor } from "~/features/DdbProcessor/index.js";
import { PipelineBuilder } from "~/domain/pipeline/PipelineBuilder.js";
import { Pipeline } from "~/domain/pipeline/Pipeline.js";

describe("PipelineBuilderFactory", () => {
    it("resolves from the DI container", () => {
        const container = createDdbContainer();
        const factory = container.resolve(PipelineBuilderFactory);
        expect(typeof factory.create).toBe("function");
    });

    it("create() returns a PipelineBuilder with fluent API", () => {
        const container = createDdbContainer();
        const factory = container.resolve(PipelineBuilderFactory);

        const builder = factory.create({
            name: "test-pipeline",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });

        expect(builder).toBeInstanceOf(PipelineBuilder);
        expect(typeof builder.filter).toBe("function");
        expect(typeof builder.use).toBe("function");
        expect(typeof builder.build).toBe("function");
    });

    it("builder.build() produces a Pipeline", async () => {
        const container = createDdbContainer();
        const factory = container.resolve(PipelineBuilderFactory);

        const pipeline = await factory
            .create({
                name: "test-pipeline",
                scanner: DdbScanner,
                processors: [DdbProcessor]
            })
            .build();

        expect(pipeline).toBeInstanceOf(Pipeline);
        expect(pipeline.name).toBe("test-pipeline");
    });
});

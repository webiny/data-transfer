import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.js";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.js";
import { createFilter } from "~/domain/pipeline/index.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";
import { DdbScanner } from "~/features/DdbScanner/index.js";
import { DdbProcessor } from "~/features/DdbProcessor/index.js";
import { S3Processor } from "~/features/S3Processor/index.js";

function makeBuilder(factory: PipelineBuilderFactory.Interface, name: string) {
    return factory.create({
        name,
        scanner: DdbScanner,
        processors: [DdbProcessor]
    });
}

describe("PipelineRunner.getProcessors", () => {
    it("returns empty array when no pipelines registered", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        expect(runner.getProcessors()).toEqual([]);
    });

    it("returns one entry when pipelines share the same processor token", async () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        const factory = container.resolve(PipelineBuilderFactory);

        const b1 = makeBuilder(factory, "p1").filter(createFilter<BaseRecord>(() => true));
        const b2 = makeBuilder(factory, "p2").filter(createFilter<BaseRecord>(() => true));
        runner.register(await b1.build());
        runner.register(await b2.build());

        const processors = runner.getProcessors();
        expect(processors).toHaveLength(1);
    });

    it("returns distinct entries for distinct processor tokens across pipelines", async () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        const factory = container.resolve(PipelineBuilderFactory);

        const onlyDdb = factory
            .create({ name: "ddb-only", scanner: DdbScanner, processors: [DdbProcessor] })
            .filter(createFilter<BaseRecord>(() => true));
        const bothProcessors = factory
            .create({
                name: "ddb-and-s3",
                scanner: DdbScanner,
                processors: [DdbProcessor, S3Processor]
            })
            .filter(createFilter<BaseRecord>(() => true));

        const p1 = await onlyDdb.build();
        const p2 = await bothProcessors.build();
        runner.register(p1).register(p2);

        const processors = runner.getProcessors();
        expect(processors).toHaveLength(2);
    });
});

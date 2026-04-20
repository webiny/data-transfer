import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { createFilter } from "~/domain/pipeline/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { S3Processor } from "~/features/S3Processor/index.ts";

function makeBuilder(runner: PipelineRunner.Interface, name: string) {
    return runner.pipeline({
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

    it("returns one entry when pipelines share the same processor token", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);

        const b1 = makeBuilder(runner, "p1").filter(createFilter<BaseRecord>(() => true));
        const b2 = makeBuilder(runner, "p2").filter(createFilter<BaseRecord>(() => true));
        runner.register(b1.build());
        runner.register(b2.build());

        const processors = runner.getProcessors();
        expect(processors).toHaveLength(1);
    });

    it("returns distinct entries for distinct processor tokens across pipelines", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);

        const onlyDdb = runner
            .pipeline({ name: "ddb-only", scanner: DdbScanner, processors: [DdbProcessor] })
            .filter(createFilter<BaseRecord>(() => true));
        const bothProcessors = runner
            .pipeline({
                name: "ddb-and-s3",
                scanner: DdbScanner,
                processors: [DdbProcessor, S3Processor]
            })
            .filter(createFilter<BaseRecord>(() => true));

        runner.register(onlyDdb.build()).register(bothProcessors.build());

        const processors = runner.getProcessors();
        expect(processors).toHaveLength(2);
    });
});

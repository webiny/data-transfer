import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { Pipeline, createFilter } from "~/domain/pipeline/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";

type AnyPipeline = Pipeline<unknown, Processor.Context, unknown>;

function makeBuilder(runner: PipelineRunner.Interface, name: string) {
    return runner.pipeline({
        name,
        scanner: DdbScanner,
        processor: DdbProcessor
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
        runner.register(b1.build() as unknown as AnyPipeline);
        runner.register(b2.build() as unknown as AnyPipeline);

        const processors = runner.getProcessors();
        expect(processors).toHaveLength(1);
    });
});

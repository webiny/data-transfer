import { describe, expectTypeOf, it } from "vitest";
import { createDdbContainer, createOsContainer } from "../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/abstractions/PipelineRunner.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { OsScanner } from "~/features/OsScanner/index.ts";
import { OsProcessor } from "~/features/OsProcessor/index.ts";

/**
 * Basic smoke tests for runner.pipeline() type inference. The deep
 * slice-inference rules (processor shape flows onto ctx, disjoint keys,
 * NonEmptyArray, etc.) live in PipelineBuilder.slices.test.ts.
 */
describe("runner.pipeline() type inference", () => {
    it("compiles for a DDB scanner + processors tuple", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        const builder = runner.pipeline({
            name: "test",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        expectTypeOf(builder.filter).toBeFunction();
        expectTypeOf(builder.use).toBeFunction();
        expectTypeOf(builder.build).toBeFunction();
    });

    it("compiles for an OS scanner + processors tuple", () => {
        const container = createOsContainer();
        const runner = container.resolve(PipelineRunner);
        const builder = runner.pipeline({
            name: "test",
            scanner: OsScanner,
            processors: [OsProcessor]
        });
        expectTypeOf(builder.filter).toBeFunction();
    });
});

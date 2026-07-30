import { describe, expectTypeOf, it } from "vitest";
import { createDdbContainer, createOsContainer } from "../../containers/index.ts";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.js";
import { DdbScanner } from "~/features/DdbScanner/index.js";
import { DdbProcessor } from "~/features/DdbProcessor/index.js";
import { OsScanner } from "~/features/OsScanner/index.js";
import { OsProcessor } from "~/features/OsProcessor/index.js";

/**
 * Basic smoke tests for PipelineBuilderFactory.create() type inference. The
 * deep slice-inference rules (processor shape flows onto ctx, disjoint keys,
 * NonEmptyArray, etc.) live in PipelineBuilder.slices.test.ts.
 */
describe("PipelineBuilderFactory.create() type inference", () => {
    it("compiles for a DDB scanner + processors tuple", () => {
        const container = createDdbContainer();
        const factory = container.resolve(PipelineBuilderFactory);
        const builder = factory.create({
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
        const factory = container.resolve(PipelineBuilderFactory);
        const builder = factory.create({
            name: "test",
            scanner: OsScanner,
            processors: [OsProcessor]
        });
        expectTypeOf(builder.filter).toBeFunction();
    });
});

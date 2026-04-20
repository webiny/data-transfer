import { describe, expectTypeOf, it } from "vitest";
import { createDdbContainer, createOsContainer } from "../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/abstractions/PipelineRunner.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { OsScanner } from "~/features/OsScanner/index.ts";
import { OsProcessor } from "~/features/OsProcessor/index.ts";

describe("runner.pipeline() type inference", () => {
    it("compiles for matching DDB scanner+processor pair", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        const builder = runner.pipeline({
            name: "test",
            scanner: DdbScanner,
            processor: DdbProcessor
        });
        expectTypeOf(builder.filter).toBeFunction();
        expectTypeOf(builder.use).toBeFunction();
        expectTypeOf(builder.build).toBeFunction();
    });

    it("compiles for matching OS scanner+processor pair", () => {
        const container = createOsContainer();
        const runner = container.resolve(PipelineRunner);
        const builder = runner.pipeline({
            name: "test",
            scanner: OsScanner,
            processor: OsProcessor
        });
        expectTypeOf(builder.filter).toBeFunction();
    });

    it("rejects mismatched scanner+processor pairs at compile time", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        // @ts-expect-error — DdbScanner produces BaseRecord but OsProcessor wants OsRecord.
        runner.pipeline({ name: "x", scanner: DdbScanner, processor: OsProcessor });
        // @ts-expect-error — symmetric mismatch: OsScanner produces OsRecord but DdbProcessor wants BaseRecord.
        runner.pipeline({ name: "y", scanner: OsScanner, processor: DdbProcessor });
    });
});

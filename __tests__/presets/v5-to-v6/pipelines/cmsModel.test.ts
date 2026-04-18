import { describe, expect, it } from "vitest";
import { createDdbContainer } from "../../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { cmsModelPipeline } from "~/presets/v5-to-v6/pipelines/cmsModel.ts";

describe("cmsModelPipeline", () => {
    it("has the expected name", () => {
        expect(cmsModelPipeline.name).toBe("cms-models");
    });

    it("registers with the runner (proven by duplicate-registration throw)", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        cmsModelPipeline.register(runner, DdbScanner, DdbProcessor);
        expect(() => cmsModelPipeline.register(runner, DdbScanner, DdbProcessor)).toThrow(
            /already registered/i
        );
    });
});

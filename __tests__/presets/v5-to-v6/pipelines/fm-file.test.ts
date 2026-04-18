import { describe, expect, it } from "vitest";
import { createDdbContainer } from "../../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { fmFilePipeline } from "~/presets/v5-to-v6/pipelines/fm-file.ts";

describe("fmFilePipeline", () => {
    it("has the expected name", () => {
        expect(fmFilePipeline.name).toBe("fm-files");
    });

    it("registers with the runner (proven by duplicate-registration throw)", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        fmFilePipeline.register(runner, DdbScanner, DdbProcessor);
        expect(() => fmFilePipeline.register(runner, DdbScanner, DdbProcessor)).toThrow(
            /already registered/i
        );
    });
});

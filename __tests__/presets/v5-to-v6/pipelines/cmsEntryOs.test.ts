import { describe, expect, it } from "vitest";
import { createOsContainer } from "../../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { OsScanner } from "~/features/OsScanner/index.ts";
import { OsProcessor } from "~/features/OsProcessor/index.ts";
import { cmsEntryOsPipeline } from "~/presets/v5-to-v6/pipelines/cmsEntryOs.ts";

describe("cmsEntryOsPipeline", () => {
    it("has the expected name", () => {
        expect(cmsEntryOsPipeline.name).toBe("cms-entries-os");
    });

    it("registers with the runner (proven by duplicate-registration throw)", () => {
        const container = createOsContainer();
        const runner = container.resolve(PipelineRunner);
        cmsEntryOsPipeline.register(runner, OsScanner, OsProcessor);
        expect(() => cmsEntryOsPipeline.register(runner, OsScanner, OsProcessor)).toThrow(
            /already registered/i
        );
    });
});

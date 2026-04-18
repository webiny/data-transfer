import { describe, expect, it } from "vitest";
import { createDdbContainer } from "../../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { mailerSettingsPipeline } from "~/presets/v5-to-v6/pipelines/mailerSettings.ts";

describe("mailerSettingsPipeline", () => {
    it("has the expected name", () => {
        expect(mailerSettingsPipeline.name).toBe("mailer-settings");
    });

    it("registers with the runner (proven by duplicate-registration throw)", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        mailerSettingsPipeline.register(runner, DdbScanner, DdbProcessor);
        expect(() => mailerSettingsPipeline.register(runner, DdbScanner, DdbProcessor)).toThrow(
            /already registered/i
        );
    });
});

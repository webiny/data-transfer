import { describe, expect, it } from "vitest";
import { createDdbContainer } from "../../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { securityGroupsPipeline } from "~/presets/v5-to-v6/pipelines/securityGroups.ts";

describe("securityGroupsPipeline", () => {
    it("has the expected name", () => {
        expect(securityGroupsPipeline.name).toBe("security-groups");
    });

    it("registers with the runner (proven by duplicate-registration throw)", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        securityGroupsPipeline.register(runner, DdbScanner, DdbProcessor);
        expect(() => securityGroupsPipeline.register(runner, DdbScanner, DdbProcessor)).toThrow(
            /already registered/i
        );
    });
});

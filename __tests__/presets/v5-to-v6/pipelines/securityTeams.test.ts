import { describe, expect, it } from "vitest";
import { createDdbContainer } from "../../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { securityTeamsPipeline } from "~/presets/v5-to-v6/pipelines/securityTeams.ts";

describe("securityTeamsPipeline", () => {
    it("has the expected name", () => {
        expect(securityTeamsPipeline.name).toBe("security-teams");
    });

    it("registers with the runner (proven by duplicate-registration throw)", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        securityTeamsPipeline.register(runner, DdbScanner, DdbProcessor);
        expect(() => securityTeamsPipeline.register(runner, DdbScanner, DdbProcessor)).toThrow(
            /already registered/i
        );
    });
});

import { describe, expect, it } from "vitest";
import { createDdbContainer } from "../../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { folderPermissionsPipeline } from "~/presets/v5-to-v6/pipelines/folderPermissions.ts";

describe("folderPermissionsPipeline", () => {
    it("has the expected name", () => {
        expect(folderPermissionsPipeline.name).toBe("folder-permissions");
    });

    it("registers with the runner (proven by duplicate-registration throw)", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        folderPermissionsPipeline.register(runner, DdbScanner, DdbProcessor);
        expect(() => folderPermissionsPipeline.register(runner, DdbScanner, DdbProcessor)).toThrow(
            /already registered/i
        );
    });
});

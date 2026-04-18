import { describe, it, expect } from "vitest";
import { createOsContainer } from "../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { v5ToV6OsPreset } from "~/presets/v5-to-v6-os.ts";

describe("v5ToV6OsPreset — registration", () => {
    it("registers the cmsEntryOs pipeline against the OS scanner", () => {
        const container = createOsContainer();
        const runner = container.resolve(PipelineRunner);
        v5ToV6OsPreset.configure(runner);
        expect(() => v5ToV6OsPreset.configure(runner)).toThrow(/already registered/i);
    });
});

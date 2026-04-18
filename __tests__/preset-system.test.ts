import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";
import { createDdbContainer } from "./containers/index.ts";

describe("Preset System", () => {
    describe("PresetLoader.load", () => {
        it("should load built-in 'v5-to-v6' preset", async () => {
            const loader = createDdbContainer().resolve(PresetLoader);
            const preset = await loader.load("v5-to-v6");

            expect(preset).toBeDefined();
            expect(preset.name).toBe("v5-to-v6");
            expect(preset.description).toBeTruthy();
            expect(typeof preset.configure).toBe("function");
        });

        it("should throw error for unknown preset name", async () => {
            const loader = createDdbContainer().resolve(PresetLoader);
            await expect(loader.load("unknown-preset")).rejects.toThrow("Unknown preset");
        });

        it("should throw error for non-existent file path", async () => {
            const loader = createDdbContainer().resolve(PresetLoader);
            await expect(loader.load("./non-existent-preset.ts")).rejects.toThrow(
                "Preset file not found"
            );
        });
    });

    describe("v5-to-v6 Preset", () => {
        it("should have correct structure", () => {
            expect(v5ToV6Preset.name).toBe("v5-to-v6");
            expect(v5ToV6Preset.description).toBeTruthy();
            expect(typeof v5ToV6Preset.configure).toBe("function");
        });

        it("should configure runner with pipelines and run without throwing", async () => {
            const container = createDdbContainer();
            const runner = container.resolve(PipelineRunner);
            v5ToV6Preset.configure(runner);
            await expect(runner.run()).resolves.toBeUndefined();
        });
    });
});

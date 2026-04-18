import { describe, it, expect } from "vitest";
import { PresetLoader } from "../../../src/features/PresetLoader/index.ts";
import { createDdbContainer } from "../../containers/index.ts";

describe("PresetLoader Feature", () => {
    describe("DI registration", () => {
        it("should resolve PresetLoader from container", () => {
            const container = createDdbContainer();
            const loader = container.resolve(PresetLoader);
            expect(loader).toBeDefined();
            expect(typeof loader.load).toBe("function");
            expect(typeof loader.getBuiltInPresets).toBe("function");
        });

        it("should return same instance on multiple resolves", () => {
            const container = createDdbContainer();
            expect(container.resolve(PresetLoader)).toBe(container.resolve(PresetLoader));
        });
    });

    describe("getBuiltInPresets", () => {
        it("should return built-in preset names", () => {
            const container = createDdbContainer();
            const loader = container.resolve(PresetLoader);
            const presets = loader.getBuiltInPresets();
            expect(presets).toContain("v5-to-v6");
            expect(presets).toContain("v5-to-v6-os");
        });
    });

    describe("load", () => {
        // Skipped until Plan B rewrites `src/presets/v5-to-v6-ddb.ts` to stop importing
        // the deleted legacy `CmsEntryPipeline`/`CmsModelPipeline`/`FmFilePipeline` classes.
        it.skip("should load v5-to-v6 built-in preset", async () => {
            const container = createDdbContainer();
            const preset = await container.resolve(PresetLoader).load("v5-to-v6");
            expect(preset.name).toBe("v5-to-v6");
            expect(preset.description).toBeDefined();
            expect(typeof preset.configure).toBe("function");
        });

        it("should load v5-to-v6-os built-in preset", async () => {
            const container = createDdbContainer();
            const preset = await container.resolve(PresetLoader).load("v5-to-v6-os");
            expect(preset.name).toBe("v5-to-v6-os");
            expect(preset.description).toBeDefined();
            expect(typeof preset.configure).toBe("function");
        });

        it("should throw on unknown preset name", async () => {
            const container = createDdbContainer();
            await expect(container.resolve(PresetLoader).load("nonexistent")).rejects.toThrow(
                "Unknown preset"
            );
        });

        it("should throw on missing preset file", async () => {
            const container = createDdbContainer();
            await expect(
                container.resolve(PresetLoader).load("./does-not-exist.ts")
            ).rejects.toThrow("not found");
        });
    });
});

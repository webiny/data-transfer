import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
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
        it("discovers built-ins from src/presets/", () => {
            const container = createDdbContainer();
            const loader = container.resolve(PresetLoader);
            // Filename (without extension) IS the preset name — drop a .ts file
            // in src/presets/ and it ships in the next release.
            expect(loader.getBuiltInPresets()).toEqual([
                "copy-ddb",
                "copy-files",
                "copy-os",
                "v5-to-v6-ddb",
                "v5-to-v6-os"
            ]);
        });
    });

    describe("load", () => {
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

    describe("presetsDir", () => {
        const presetsDir = resolve(__dirname, "../../fixtures/presets");

        it("loads a named preset from presetsDir when not a built-in", async () => {
            const container = createDdbContainer({ presetsDir });
            const loader = container.resolve(PresetLoader);
            const preset = await loader.load("testPreset");
            expect(preset.name).toBe("test-preset");
        });

        it("error message lists user presets when presetsDir is set", async () => {
            const container = createDdbContainer({ presetsDir });
            await expect(container.resolve(PresetLoader).load("nonexistent")).rejects.toThrow(
                "Available user presets"
            );
        });

        it("built-in preset takes precedence over a same-named user preset", async () => {
            // Resolution order: built-ins first. Even with presetsDir set, a
            // built-in name resolves to the built-in without touching presetsDir.
            const container = createDdbContainer({ presetsDir });
            const loader = container.resolve(PresetLoader);
            const preset = await loader.load("v5-to-v6-ddb");
            expect(preset.name).toBe("v5-to-v6-ddb");
        });
    });
});

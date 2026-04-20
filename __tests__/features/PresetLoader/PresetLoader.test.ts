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
        it("discovers built-ins from src/presets/ (excluding example.ts)", () => {
            const container = createDdbContainer();
            const loader = container.resolve(PresetLoader);
            // Filename (without extension) IS the preset name — drop a .ts file
            // in src/presets/ and it ships. example.ts is excluded as the
            // canonical reference, not a real preset.
            expect(loader.getBuiltInPresets()).toEqual(["v5-to-v6-ddb"]);
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
});

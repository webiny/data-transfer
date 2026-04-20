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
        it("discovers built-ins from src/presets/builtin/ — currently empty", () => {
            const container = createDdbContainer();
            const loader = container.resolve(PresetLoader);
            // The builtin/ directory exists but ships no presets today; adding
            // one is a file drop, no code change.
            expect(loader.getBuiltInPresets()).toEqual([]);
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

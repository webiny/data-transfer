import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import { PresetLoader, PresetLoaderFeature } from "../../../src/features/PresetLoader/index.ts";
import { LoggerFeature } from "../../../src/features/Logger/index.ts";

describe("PresetLoader Feature", () => {
    function createContainer(): Container {
        const container = new Container();
        LoggerFeature.register(container, { logLevel: "error", json: false });
        PresetLoaderFeature.register(container);
        return container;
    }

    describe("DI registration", () => {
        it("should resolve PresetLoader from container", () => {
            const container = createContainer();
            const loader = container.resolve(PresetLoader);
            expect(loader).toBeDefined();
            expect(typeof loader.load).toBe("function");
            expect(typeof loader.getBuiltInPresets).toBe("function");
        });

        it("should return same instance on multiple resolves", () => {
            const container = createContainer();
            const first = container.resolve(PresetLoader);
            const second = container.resolve(PresetLoader);
            expect(first).toBe(second);
        });
    });

    describe("getBuiltInPresets", () => {
        it("should return built-in preset names", () => {
            const container = createContainer();
            const loader = container.resolve(PresetLoader);
            const presets = loader.getBuiltInPresets();
            expect(presets).toContain("v5-to-v6");
            expect(presets).toContain("v5-to-v6-os");
        });
    });

    describe("load", () => {
        it("should load v5-to-v6 built-in preset", async () => {
            const container = createContainer();
            const loader = container.resolve(PresetLoader);
            const preset = await loader.load("v5-to-v6");
            expect(preset.name).toBe("v5-to-v6");
            expect(preset.description).toBeDefined();
            expect(typeof preset.configure).toBe("function");
        });

        it("should load v5-to-v6-os built-in preset", async () => {
            const container = createContainer();
            const loader = container.resolve(PresetLoader);
            const preset = await loader.load("v5-to-v6-os");
            expect(preset.name).toBe("v5-to-v6-os");
            expect(preset.description).toBeDefined();
            expect(typeof preset.configure).toBe("function");
        });

        it("should throw on unknown preset name", async () => {
            const container = createContainer();
            const loader = container.resolve(PresetLoader);
            await expect(loader.load("nonexistent")).rejects.toThrow("Unknown preset");
        });

        it("should throw on missing preset file", async () => {
            const container = createContainer();
            const loader = container.resolve(PresetLoader);
            await expect(loader.load("./does-not-exist.ts")).rejects.toThrow("not found");
        });
    });
});

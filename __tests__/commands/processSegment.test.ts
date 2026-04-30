import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";

const runSpy = vi.fn();
const getProcessorsSpy = vi.fn(() => []);
const loadSpy = vi.fn(async () => ({
    name: "test-preset",
    description: "test",
    configure(_ctx: unknown): void {}
}));
const resolveMap = new Map<unknown, unknown>();
const registerInstanceSpy = vi.fn();

vi.mock("~/features/MigrationConfig/loadConfig.ts", () => ({
    loadConfig: vi.fn(async (_path: string) => ({ storage: "ddb", pipeline: { preset: "x" } }))
}));
vi.mock("~/bootstrap.ts", () => ({
    bootstrap: vi.fn(() => ({
        resolve: (token: unknown) => resolveMap.get(token),
        registerInstance: registerInstanceSpy
    }))
}));

import { handler } from "~/commands/processSegment/handler.ts";
import { Logger } from "~/tools/Logger/index.ts";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";
import { BeforeLoadPresetHook, AfterLoadPresetHook } from "~/features/PresetLifecycle/index.ts";

describe("processSegment handler", () => {
    beforeEach(() => {
        runSpy.mockReset();
        getProcessorsSpy.mockReset().mockReturnValue([]);
        registerInstanceSpy.mockReset();
        loadSpy.mockReset().mockResolvedValue({
            name: "test-preset",
            description: "test",
            configure(_ctx: unknown): void {}
        });
        resolveMap.clear();
        resolveMap.set(Logger, {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
        });
        resolveMap.set(PipelineRunner, {
            run: runSpy,
            getProcessors: getProcessorsSpy,
            getShardStats: vi.fn(() => null)
        });
        resolveMap.set(PipelineBuilderFactory, { create: vi.fn() });
        resolveMap.set(PresetLoader, { load: loadSpy, getBuiltInPresets: () => [] });
        resolveMap.set(FileTool, { exists: existsSync });
        resolveMap.set(BeforeLoadPresetHook, { execute: vi.fn() });
        resolveMap.set(AfterLoadPresetHook, { execute: vi.fn() });
    });

    it("loads preset, configures runner, calls run({segment, totalSegments})", async () => {
        await handler({ runId: "r1", segment: 2, total: 4, config: "./x.ts" });

        expect(loadSpy).toHaveBeenCalledWith("x");
        expect(runSpy).toHaveBeenCalledWith({ segment: 2, totalSegments: 4 });
    });

    it("registers TransferContext with the provided runId", async () => {
        await handler({ runId: "r-xyz", segment: 0, total: 1, config: "./x.ts" });

        expect(registerInstanceSpy).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ runId: "r-xyz" })
        );
    });

    it("re-throws on runner failure", async () => {
        runSpy.mockRejectedValueOnce(new Error("boom"));
        await expect(
            handler({ runId: "r1", segment: 0, total: 1, config: "./x.ts" })
        ).rejects.toThrow("boom");
    });
});

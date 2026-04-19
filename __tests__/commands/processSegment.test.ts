import { describe, it, expect, vi, beforeEach } from "vitest";

const runSpy = vi.fn();
const getProcessorsSpy = vi.fn(() => []);
const loadSpy = vi.fn(async () => ({
    name: "test-preset",
    description: "test",
    configure(_runner: unknown): void {}
}));
const resolveMap = new Map<unknown, unknown>();

vi.mock("~/features/MigrationConfig/loadConfig.ts", () => ({
    loadConfig: vi.fn(async (_path: string) => ({ storage: "ddb", pipeline: { preset: "x" } }))
}));
vi.mock("~/bootstrap.ts", () => ({
    bootstrap: vi.fn(() => ({
        resolve: (token: unknown) => resolveMap.get(token),
        registerInstance: vi.fn()
    }))
}));

import { handler } from "~/commands/processSegment/handler.ts";
import { Logger } from "~/tools/Logger/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";

describe("processSegment handler", () => {
    beforeEach(() => {
        runSpy.mockReset();
        getProcessorsSpy.mockReset().mockReturnValue([]);
        loadSpy.mockReset().mockResolvedValue({
            name: "test-preset",
            description: "test",
            configure(_runner: unknown): void {}
        });
        resolveMap.clear();
        resolveMap.set(Logger, {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
        });
        resolveMap.set(PipelineRunner, { run: runSpy, getProcessors: getProcessorsSpy });
        resolveMap.set(PresetLoader, { load: loadSpy, getBuiltInPresets: () => [] });
    });

    it("loads preset, configures runner, calls run({segment, totalSegments})", async () => {
        await handler({ runId: "r1", segment: 2, total: 4, config: "./x.ts" });

        expect(loadSpy).toHaveBeenCalledWith("x");
        expect(runSpy).toHaveBeenCalledWith({ segment: 2, totalSegments: 4 });
    });

    it("re-throws on runner failure", async () => {
        runSpy.mockRejectedValueOnce(new Error("boom"));
        await expect(
            handler({ runId: "r1", segment: 0, total: 1, config: "./x.ts" })
        ).rejects.toThrow("boom");
    });
});

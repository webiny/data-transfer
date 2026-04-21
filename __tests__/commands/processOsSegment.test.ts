import { describe, it, expect, vi, beforeEach } from "vitest";

const runSpy = vi.fn();
const loadSpy = vi.fn(async () => ({
    name: "test-os-preset",
    description: "test",
    configure(_ctx: unknown): void {}
}));
const resolveMap = new Map<unknown, unknown>();
const registerInstanceSpy = vi.fn();

vi.mock("~/features/MigrationConfig/loadConfig.ts", () => ({
    loadConfig: vi.fn(async (_path: string) => ({ storage: "os", pipeline: { preset: "x" } }))
}));
vi.mock("~/bootstrap.ts", () => ({
    bootstrap: vi.fn(() => ({
        resolve: (token: unknown) => resolveMap.get(token),
        registerInstance: registerInstanceSpy
    }))
}));

import { handler } from "~/commands/processOsSegment/handler.ts";
import { Logger } from "~/tools/Logger/index.ts";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";

describe("processOsSegment handler", () => {
    beforeEach(() => {
        runSpy.mockReset();
        loadSpy.mockReset().mockResolvedValue({
            name: "test-os-preset",
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
        resolveMap.set(PipelineRunner, { run: runSpy });
        resolveMap.set(PipelineBuilderFactory, { create: vi.fn() });
        resolveMap.set(PresetLoader, { load: loadSpy, getBuiltInPresets: () => [] });
        // loadUserSetup resolves FileTool to look for setup.ts; no-op here.
        resolveMap.set(FileTool, { exists: () => false });
    });

    it("delegates shard execution to the runner with {segment, totalSegments}", async () => {
        await handler({ runId: "r1", segment: 2, total: 4, config: "./x.ts" });

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
        runSpy.mockRejectedValueOnce(new Error("scan fail"));
        await expect(
            handler({ runId: "r3", segment: 0, total: 1, config: "./x.ts" })
        ).rejects.toThrow("scan fail");
    });
});

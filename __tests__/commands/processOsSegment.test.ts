import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const runSpy = vi.fn();
const touchedIndexesMap = new Map<string, string>();
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
import { DirectoryTool } from "~/tools/DirectoryTool/abstractions/DirectoryTool.ts";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";

describe("processOsSegment handler", () => {
    let originalCwd: string;
    let workDir: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        workDir = await mkdtemp(join(tmpdir(), "os-handler-"));
        process.chdir(workDir);

        runSpy.mockReset();
        touchedIndexesMap.clear();
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
        const fakeOsProcessor = {
            execute: vi.fn(),
            createContext: vi.fn(),
            getShardState: () => ({
                touchedIndexes: [...touchedIndexesMap.entries()].map(
                    ([indexName, originalRefresh]) => ({ indexName, originalRefresh })
                )
            })
        };
        resolveMap.set(PipelineRunner, {
            run: runSpy,
            getProcessors: () => [fakeOsProcessor]
        });
        resolveMap.set(PipelineBuilderFactory, { create: vi.fn() });
        resolveMap.set(PresetLoader, { load: loadSpy, getBuiltInPresets: () => [] });
        resolveMap.set(DirectoryTool, {
            create: (p: string) => mkdirSync(p, { recursive: true })
        });
        resolveMap.set(FileTool, {
            writeFileOrThrow: (p: string, content: string) => writeFileSync(p, content)
        });
    });

    afterEach(() => {
        process.chdir(originalCwd);
    });

    it("writes <segment>-indexes.json after successful run", async () => {
        touchedIndexesMap.set("root-headless-cms-category", "1s");
        touchedIndexesMap.set("root-headless-cms-article", "5s");

        await handler({ runId: "r1", segment: 2, total: 4, config: "./x.ts" });

        const filePath = join(workDir, ".transfer", "r1", "2-indexes.json");
        const content = await readFile(filePath, "utf-8");
        const parsed = JSON.parse(content);
        expect(parsed).toEqual([
            { indexName: "root-headless-cms-category", originalRefresh: "1s" },
            { indexName: "root-headless-cms-article", originalRefresh: "5s" }
        ]);
    });

    it("writes empty indexes file when no indexes touched", async () => {
        await handler({ runId: "r2", segment: 0, total: 1, config: "./x.ts" });

        const filePath = join(workDir, ".transfer", "r2", "0-indexes.json");
        const content = await readFile(filePath, "utf-8");
        expect(JSON.parse(content)).toEqual([]);
    });

    it("re-throws on runner failure", async () => {
        runSpy.mockRejectedValueOnce(new Error("scan fail"));
        await expect(
            handler({ runId: "r3", segment: 0, total: 1, config: "./x.ts" })
        ).rejects.toThrow("scan fail");
    });
});

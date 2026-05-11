import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "path";
import { Container } from "@webiny/di";
import { EnableRefreshHook } from "~/services/OpenSearchClient/hooks/EnableRefreshHook.ts";
import { AfterTransferHook } from "~/features/TransferLifecycle/abstractions/TransferLifecycle.ts";
import { TransferLifecycleFeature } from "~/features/TransferLifecycle/feature.ts";
import { OpenSearchClient } from "~/services/OpenSearchClient/abstractions/OpenSearchClient.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import { DirectoryTool } from "~/tools/DirectoryTool/abstractions/DirectoryTool.ts";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.ts";
import type { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";

const RUN_ID = "test-run-42";
const TRANSFER_DIR = join(process.cwd(), ".transfer", RUN_ID);

interface Harness {
    hook: AfterTransferHook.Interface;
    putIndexSettings: ReturnType<typeof vi.fn>;
    warnCalls: string[];
    infoCalls: string[];
    dirFiles: Map<string, string[] | null>;
    fileContents: Map<string, string | null>;
}

function makeHarness(
    dirFiles: Map<string, string[] | null> = new Map(),
    fileContents: Map<string, string | null> = new Map()
): Harness {
    const putIndexSettings = vi.fn().mockResolvedValue(undefined);
    const warnCalls: string[] = [];
    const infoCalls: string[] = [];

    const mockOs: OpenSearchClient.Interface = {
        indexExists: vi.fn(),
        createIndex: vi.fn(),
        listIndexes: vi.fn(),
        putIndexSettings,
        getIndexSettings: vi.fn()
    };

    const mockLogger: Logger.Interface = {
        debug: vi.fn(),
        info: (_msg: string) => { infoCalls.push(_msg); },
        warn: (_msg: string) => { warnCalls.push(_msg); },
        error: vi.fn(),
        fatal: vi.fn(),
        done: vi.fn(),
        child: vi.fn()
    };

    const mockDirTool: DirectoryTool.Interface = {
        exists: vi.fn(),
        create: vi.fn(),
        readDir: (path: string) => dirFiles.get(path) ?? null,
        readDirOrThrow: vi.fn(),
        remove: vi.fn(),
        copy: vi.fn(),
        copyOrThrow: vi.fn()
    };

    const mockFileTool: FileTool.Interface = {
        exists: vi.fn(),
        readFile: (path: string) => fileContents.get(path) ?? null,
        readFileOrThrow: vi.fn(),
        writeFile: vi.fn(),
        writeFileOrThrow: vi.fn(),
        remove: vi.fn(),
        copy: vi.fn(),
        copyOrThrow: vi.fn()
    };

    const container = new Container();
    TransferLifecycleFeature.register(container);
    container.registerInstance(TransferContext, { runId: RUN_ID });
    container.registerInstance(OpenSearchClient, mockOs);
    container.registerInstance(Logger, mockLogger);
    container.registerInstance(DirectoryTool, mockDirTool);
    container.registerInstance(FileTool, mockFileTool);
    container.register(EnableRefreshHook);

    const hook = container.resolve(AfterTransferHook);
    return { hook, putIndexSettings, warnCalls, infoCalls, dirFiles, fileContents };
}

function indexFile(items: TouchedIndexes.Item[]): string {
    return JSON.stringify(items);
}

describe("EnableRefreshHook", () => {
    it("does nothing when the .transfer/<runId> directory does not exist", async () => {
        const { hook, putIndexSettings } = makeHarness();
        // dirFiles is empty → readDir returns null
        await hook.execute();
        expect(putIndexSettings).not.toHaveBeenCalled();
    });

    it("does nothing when the directory exists but has no index files", async () => {
        const dirFiles = new Map([[TRANSFER_DIR, ["segment-0.log", "segment-0-unmatched.log"]]]);
        const { hook, putIndexSettings } = makeHarness(dirFiles);
        await hook.execute();
        expect(putIndexSettings).not.toHaveBeenCalled();
    });

    it("restores refresh_interval for each index in the file", async () => {
        const items: TouchedIndexes.Item[] = [
            { indexName: "tenant-cms-entries", originalRefresh: "1s" },
            { indexName: "tenant-cms-models", originalRefresh: "5s" }
        ];
        const filePath = join(TRANSFER_DIR, "segment-0-indexes.json");
        const dirFiles = new Map([[TRANSFER_DIR, ["segment-0-indexes.json"]]]);
        const fileContents = new Map([[filePath, indexFile(items)]]);

        const { hook, putIndexSettings } = makeHarness(dirFiles, fileContents);
        await hook.execute();

        expect(putIndexSettings).toHaveBeenCalledTimes(2);
        expect(putIndexSettings).toHaveBeenCalledWith("tenant-cms-entries", {
            index: { refresh_interval: "1s" }
        });
        expect(putIndexSettings).toHaveBeenCalledWith("tenant-cms-models", {
            index: { refresh_interval: "5s" }
        });
    });

    it("applies first-writer-wins when the same index appears in multiple segment files", async () => {
        const seg0Items: TouchedIndexes.Item[] = [
            { indexName: "shared-index", originalRefresh: "1s" }
        ];
        const seg1Items: TouchedIndexes.Item[] = [
            { indexName: "shared-index", originalRefresh: "30s" }
        ];
        const dirFiles = new Map([
            [TRANSFER_DIR, ["segment-0-indexes.json", "segment-1-indexes.json"]]
        ]);
        const fileContents = new Map([
            [join(TRANSFER_DIR, "segment-0-indexes.json"), indexFile(seg0Items)],
            [join(TRANSFER_DIR, "segment-1-indexes.json"), indexFile(seg1Items)]
        ]);

        const { hook, putIndexSettings } = makeHarness(dirFiles, fileContents);
        await hook.execute();

        expect(putIndexSettings).toHaveBeenCalledOnce();
        expect(putIndexSettings).toHaveBeenCalledWith("shared-index", {
            index: { refresh_interval: "1s" }
        });
    });

    it("logs a warning and continues when putIndexSettings throws", async () => {
        const items: TouchedIndexes.Item[] = [
            { indexName: "idx-a", originalRefresh: "1s" },
            { indexName: "idx-b", originalRefresh: "5s" }
        ];
        const filePath = join(TRANSFER_DIR, "segment-0-indexes.json");
        const dirFiles = new Map([[TRANSFER_DIR, ["segment-0-indexes.json"]]]);
        const fileContents = new Map([[filePath, indexFile(items)]]);

        const { hook, putIndexSettings, warnCalls } = makeHarness(dirFiles, fileContents);
        putIndexSettings.mockRejectedValueOnce(new Error("OS unavailable"));

        await hook.execute();

        // Second index is still restored despite the first failing
        expect(putIndexSettings).toHaveBeenCalledTimes(2);
        expect(warnCalls.some(m => m.includes("idx-a"))).toBe(true);
    });

    it("warns and skips a file whose content is not a JSON array", async () => {
        const filePath = join(TRANSFER_DIR, "segment-0-indexes.json");
        const dirFiles = new Map([[TRANSFER_DIR, ["segment-0-indexes.json"]]]);
        const fileContents = new Map([[filePath, JSON.stringify({ notAnArray: true })]]);

        const { hook, putIndexSettings, warnCalls } = makeHarness(dirFiles, fileContents);
        await hook.execute();

        expect(putIndexSettings).not.toHaveBeenCalled();
        expect(warnCalls.some(m => m.includes("segment-0-indexes.json"))).toBe(true);
    });

    it("warns and skips a file that readFile cannot read (returns null)", async () => {
        const dirFiles = new Map([[TRANSFER_DIR, ["segment-0-indexes.json"]]]);
        // fileContents is empty → readFile returns null
        const { hook, putIndexSettings, warnCalls } = makeHarness(dirFiles);
        await hook.execute();

        expect(putIndexSettings).not.toHaveBeenCalled();
        expect(warnCalls.some(m => m.includes("segment-0-indexes.json"))).toBe(true);
    });

    it("warns and skips a file that contains invalid JSON", async () => {
        const filePath = join(TRANSFER_DIR, "segment-0-indexes.json");
        const dirFiles = new Map([[TRANSFER_DIR, ["segment-0-indexes.json"]]]);
        const fileContents = new Map([[filePath, "{ broken json"]]);

        const { hook, putIndexSettings, warnCalls } = makeHarness(dirFiles, fileContents);
        await hook.execute();

        expect(putIndexSettings).not.toHaveBeenCalled();
        expect(warnCalls.some(m => m.includes("segment-0-indexes.json"))).toBe(true);
    });
});

import { join } from "path";
import { AfterTransferHook } from "~/features/TransferLifecycle/abstractions/TransferLifecycle.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import { OpenSearchClient } from "../abstractions/OpenSearchClient.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { DirectoryTool } from "~/tools/DirectoryTool/abstractions/DirectoryTool.ts";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.ts";
import type { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";

class EnableRefreshHookImpl implements AfterTransferHook.Interface {
    public constructor(
        private readonly osClient: OpenSearchClient.Interface,
        private readonly logger: Logger.Interface,
        private readonly transferContext: TransferContext.Interface,
        private readonly dirTool: DirectoryTool.Interface,
        private readonly fileTool: FileTool.Interface
    ) {}

    public async execute(): Promise<void> {
        const touchedIndexes = await this.loadTouchedIndexes();

        if (touchedIndexes.size === 0) {
            this.logger.info("No touched indexes to restore.");
            return;
        }

        this.logger.info(`Restoring refresh_interval on ${touchedIndexes.size} indexes...`);

        for (const [indexName, originalRefresh] of touchedIndexes) {
            try {
                await this.osClient.putIndexSettings(indexName, {
                    index: { refresh_interval: originalRefresh }
                });
                this.logger.info(`Restored refresh on ${indexName} to ${originalRefresh}`);
            } catch (error) {
                this.logger.warn(
                    `Failed to restore refresh on index: ${indexName}. Error: ${error}`
                );
            }
        }

        // Clean up transfer directory
        await this.cleanup();

        this.logger.info(`Indexing restored on ${touchedIndexes.size} indexes.`);
    }

    private async loadTouchedIndexes(): Promise<Map<string, string>> {
        const merged = new Map<string, string>();
        const transferDir = join(process.cwd(), ".transfer", this.transferContext.runId);

        // Directory absent → no indexes were touched. readDir returns null.
        const files = this.dirTool.readDir(transferDir);
        if (!files) {
            return merged;
        }

        const indexFiles = files.filter(f => f.endsWith("-indexes.json"));

        for (const file of indexFiles) {
            try {
                const content = this.fileTool.readFile(join(transferDir, file));
                if (content === null) {
                    this.logger.warn(`Failed to read index file ${file}`);
                    continue;
                }
                const data = JSON.parse(content);
                if (!Array.isArray(data)) {
                    this.logger.warn(
                        `Ignoring ${file}: expected an array, got ${typeof data}. Stale file from an older run — clean up .transfer/<runId>/ manually.`
                    );
                    continue;
                }
                for (const item of data as TouchedIndexes.Item[]) {
                    // First writer wins — if multiple segments touched the same index,
                    // the original refresh_interval from the first one is correct
                    if (!merged.has(item.indexName)) {
                        merged.set(item.indexName, item.originalRefresh);
                    }
                }
            } catch (error) {
                this.logger.warn(`Failed to read index file ${file}: ${error}`);
            }
        }

        return merged;
    }

    private async cleanup(): Promise<void> {
        const transferDir = join(process.cwd(), ".transfer", this.transferContext.runId);
        // Best effort cleanup. dirTool.remove is force+recursive internally.
        this.dirTool.remove(transferDir);
    }
}

export const EnableRefreshHook = AfterTransferHook.createImplementation({
    implementation: EnableRefreshHookImpl,
    dependencies: [OpenSearchClient, Logger, TransferContext, DirectoryTool, FileTool]
});

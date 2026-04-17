import { readdir, readFile, rm } from "fs/promises";
import { join } from "path";
import { AfterTransferHook } from "~/features/TransferLifecycle/abstractions/TransferLifecycle.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import { OpenSearchClient } from "../abstractions/OpenSearchClient.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";

class EnableRefreshHookImpl implements AfterTransferHook.Interface {
    public constructor(
        private readonly osClient: OpenSearchClient.Interface,
        private readonly logger: Logger.Interface,
        private readonly transferContext: TransferContext.Interface
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

        try {
            const files = await readdir(transferDir);
            const indexFiles = files.filter(f => f.endsWith("-indexes.json"));

            for (const file of indexFiles) {
                try {
                    const content = await readFile(join(transferDir, file), "utf-8");
                    const data = JSON.parse(content) as Record<string, string>;
                    for (const [indexName, originalRefresh] of Object.entries(data)) {
                        // First writer wins — if multiple segments touched the same index,
                        // the original refresh_interval from the first one is correct
                        if (!merged.has(indexName)) {
                            merged.set(indexName, originalRefresh);
                        }
                    }
                } catch (error) {
                    this.logger.warn(`Failed to read index file ${file}: ${error}`);
                }
            }
        } catch {
            // Directory doesn't exist — no indexes were touched
        }

        return merged;
    }

    private async cleanup(): Promise<void> {
        const transferDir = join(process.cwd(), ".transfer", this.transferContext.runId);
        try {
            await rm(transferDir, { recursive: true, force: true });
        } catch {
            // Best effort cleanup
        }
    }
}

export const EnableRefreshHook = AfterTransferHook.createImplementation({
    implementation: EnableRefreshHookImpl,
    dependencies: [OpenSearchClient, Logger, TransferContext]
});

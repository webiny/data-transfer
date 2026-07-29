import { join } from "path";
import { AfterTransferHook } from "../../../features/TransferLifecycle/abstractions/TransferLifecycle.js";
import { TransferContext } from "../../../features/TransferLifecycle/abstractions/TransferContext.js";
import { OpenSearchClient } from "../abstractions/OpenSearchClient.js";
import { Logger } from "../../../tools/Logger/abstractions/Logger.js";
import { DirectoryTool } from "../../../tools/DirectoryTool/abstractions/DirectoryTool.js";
import { FileTool } from "../../../tools/FileTool/abstractions/FileTool.js";
class EnableRefreshHookImpl {
  osClient;
  logger;
  transferContext;
  dirTool;
  fileTool;
  constructor(osClient, logger, transferContext, dirTool, fileTool) {
    this.osClient = osClient;
    this.logger = logger;
    this.transferContext = transferContext;
    this.dirTool = dirTool;
    this.fileTool = fileTool;
  }
  async execute() {
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
        this.logger.warn(`Failed to restore refresh on index: ${indexName}. Error: ${error}`);
      }
    }
    this.logger.info(`Indexing restored on ${touchedIndexes.size} indexes.`);
  }
  async loadTouchedIndexes() {
    const merged = new Map();
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
        for (const item of data) {
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
}
export const EnableRefreshHook = AfterTransferHook.createImplementation({
  implementation: EnableRefreshHookImpl,
  dependencies: [OpenSearchClient, Logger, TransferContext, DirectoryTool, FileTool]
});
//# sourceMappingURL=EnableRefreshHook.js.map

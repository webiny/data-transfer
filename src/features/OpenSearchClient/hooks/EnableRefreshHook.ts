import { AfterTransferHook } from "../../TransferLifecycle/abstractions/TransferLifecycle.ts";
import { OpenSearchClient } from "../abstractions/OpenSearchClient.ts";
import { Logger } from "../../Logger/abstractions/Logger.ts";
import { MigrationConfig } from "../../MigrationConfig/abstractions/MigrationConfig.ts";

class EnableRefreshHookImpl implements AfterTransferHook.Interface {
  public constructor(
    private readonly osClient: OpenSearchClient.Interface,
    private readonly logger: Logger.Interface,
    private readonly config: MigrationConfig.Interface
  ) {}

  public async execute(): Promise<void> {
    const filterIndex = this.getFilterIndex();

    const indexes = await this.osClient.listIndexes();
    const userIndexes = indexes.filter(idx => {
      if (!idx.index || idx.index.startsWith(".")) {
        return false;
      }
      if (filterIndex) {
        return filterIndex({ index: idx.index });
      }
      return true;
    });

    if (userIndexes.length === 0) {
      this.logger.info("No matching indexes found to re-enable refresh.");
      return;
    }

    if (!filterIndex) {
      this.logger.warn(
        "No filterIndex configured — re-enabling refresh on all non-system indexes."
      );
    }

    for (const idx of userIndexes) {
      if (!idx.index) {
        continue;
      }
      try {
        await this.osClient.putIndexSettings(idx.index, { index: { refresh_interval: "1s" } });
      } catch (error) {
        this.logger.warn(
          `Failed to enable refresh on index: ${idx.index}. Skipping. Error: ${error}`
        );
      }
    }

    this.logger.info(`Indexing restored on ${userIndexes.length} indexes.`);
  }

  private getFilterIndex(): ((params: { index: string }) => boolean) | undefined {
    if (this.config.storage !== "os") {
      return undefined;
    }
    return this.config.target.opensearch.filterIndex;
  }
}

export const EnableRefreshHook = AfterTransferHook.createImplementation({
  implementation: EnableRefreshHookImpl,
  dependencies: [OpenSearchClient, Logger, MigrationConfig]
});

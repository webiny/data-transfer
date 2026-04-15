import { BeforeTransferHook } from "../../TransferLifecycle/abstractions/TransferLifecycle.ts";
import { OpenSearchClient } from "../abstractions/OpenSearchClient.ts";
import { Logger } from "../../Logger/abstractions/Logger.ts";

class DisableRefreshHookImpl implements BeforeTransferHook.Interface {
  public constructor(
    private readonly osClient: OpenSearchClient.Interface,
    private readonly logger: Logger.Interface
  ) {}

  public async execute(): Promise<void> {
    const indexes = await this.osClient.listIndexes();
    const userIndexes = indexes.filter(idx => idx.index && !idx.index.startsWith("."));

    if (userIndexes.length === 0) {
      this.logger.info("No user indexes found in target OpenSearch cluster.");
      return;
    }

    this.logger.info(`Found ${userIndexes.length} indexes`);

    for (const idx of userIndexes) {
      if (!idx.index) {
        continue;
      }
      try {
        await this.osClient.putIndexSettings(idx.index, { index: { refresh_interval: "-1" } });
      } catch (error) {
        this.logger.warn(
          `Failed to disable refresh on index: ${idx.index}. Skipping. Error: ${error}`
        );
      }
    }

    this.logger.info("Indexing disabled on all target indexes.");
  }
}

export const DisableRefreshHook = BeforeTransferHook.createImplementation({
  implementation: DisableRefreshHookImpl,
  dependencies: [OpenSearchClient, Logger]
});

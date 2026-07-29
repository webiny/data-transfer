import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import { BeforeTransferHook } from "../../features/TransferLifecycle/index.js";
class OsIndexPrefixHookImpl {
  config;
  constructor(config) {
    this.config = config;
  }
  async execute() {
    if (this.config.target.opensearch) {
      process.env.OPENSEARCH_INDEX_PREFIX = this.config.target.opensearch.indexPrefix;
    }
  }
}
export const OsIndexPrefixHook = BeforeTransferHook.createImplementation({
  implementation: OsIndexPrefixHookImpl,
  dependencies: [MigrationConfig]
});
//# sourceMappingURL=OsIndexPrefixHook.js.map

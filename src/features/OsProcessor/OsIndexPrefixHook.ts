import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.js";
import { BeforeTransferHook } from "~/features/TransferLifecycle/index.js";

class OsIndexPrefixHookImpl implements BeforeTransferHook.Interface {
    public constructor(private readonly config: MigrationConfig.Interface) {}

    public async execute(): Promise<void> {
        if (this.config.target.opensearch) {
            process.env.OPENSEARCH_INDEX_PREFIX = this.config.target.opensearch.indexPrefix;
        }
    }
}

export const OsIndexPrefixHook = BeforeTransferHook.createImplementation({
    implementation: OsIndexPrefixHookImpl,
    dependencies: [MigrationConfig]
});

import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { BeforeTransferHook } from "~/features/TransferLifecycle/index.ts";
import type { OsMigrationConfiguration } from "~/features/MigrationConfig/validation.ts";

class OsIndexPrefixHookImpl implements BeforeTransferHook.Interface {
    public constructor(private readonly config: MigrationConfig.Interface) {}

    public async execute(): Promise<void> {
        const osConfig = this.config as OsMigrationConfiguration;
        process.env.OPENSEARCH_INDEX_PREFIX = osConfig.target.opensearch.indexPrefix;
    }
}

export const OsIndexPrefixHook = BeforeTransferHook.createImplementation({
    implementation: OsIndexPrefixHookImpl,
    dependencies: [MigrationConfig]
});

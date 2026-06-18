import { getBaseConfiguration } from "@webiny/api-opensearch/indexConfiguration/index.js";
import { IndexConfigurationProvider as IndexConfigurationProviderAbstraction } from "./abstractions/IndexConfigurationProvider.ts";

class IndexConfigurationProviderImpl implements IndexConfigurationProviderAbstraction.Interface {
    public getConfiguration(
        _indexName: string
    ): IndexConfigurationProviderAbstraction.Configuration {
        const baseConfig = getBaseConfiguration();
        return {
            mappings: baseConfig.mappings as Record<string, unknown> | undefined
        };
    }
}

export const IndexConfigurationProvider =
    IndexConfigurationProviderAbstraction.createImplementation({
        implementation: IndexConfigurationProviderImpl,
        dependencies: []
    });

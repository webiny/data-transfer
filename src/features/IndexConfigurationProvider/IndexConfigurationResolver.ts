import { getBaseConfiguration } from "@webiny/api-opensearch/indexConfiguration/index.js";
import { IndexConfigurationProvider } from "./abstractions/IndexConfigurationProvider.ts";
import { IndexConfigurationResolver as IndexConfigurationResolverAbstraction } from "./abstractions/IndexConfigurationResolver.ts";

class IndexConfigurationResolverImpl implements IndexConfigurationResolverAbstraction.Interface {
    public constructor(private readonly provider: IndexConfigurationProvider.Interface) {}

    public resolve(indexName: string): IndexConfigurationProvider.Configuration {
        const base = this.getBaseConfiguration();
        return this.provider.getConfiguration(indexName, base);
    }

    private getBaseConfiguration(): IndexConfigurationProvider.Configuration {
        const baseConfig = getBaseConfiguration();
        return structuredClone({
            mappings: baseConfig.mappings as Record<string, unknown> | undefined
        });
    }
}

export const IndexConfigurationResolver =
    IndexConfigurationResolverAbstraction.createImplementation({
        implementation: IndexConfigurationResolverImpl,
        dependencies: [IndexConfigurationProvider]
    });

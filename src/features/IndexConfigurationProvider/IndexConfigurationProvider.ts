import { IndexConfigurationProvider as IndexConfigurationProviderAbstraction } from "./abstractions/IndexConfigurationProvider.ts";

export type { IIndexConfigurationProvider } from "./abstractions/IndexConfigurationProvider.js";

class IndexConfigurationProviderImpl implements IndexConfigurationProviderAbstraction.Interface {
    public getConfiguration(
        _indexName: string,
        base: IndexConfigurationProviderAbstraction.Configuration
    ): IndexConfigurationProviderAbstraction.Configuration {
        return base;
    }
}

export const IndexConfigurationProvider =
    IndexConfigurationProviderAbstraction.createImplementation({
        implementation: IndexConfigurationProviderImpl,
        dependencies: []
    });

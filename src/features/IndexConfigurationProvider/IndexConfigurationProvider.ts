import { IndexConfigurationProvider as IndexConfigurationProviderAbstraction } from "./abstractions/IndexConfigurationProvider.ts";

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

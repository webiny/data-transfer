import { getBaseConfiguration } from "@webiny/api-opensearch/indexConfiguration/index.js";
import { IndexConfigurationProvider } from "./abstractions/IndexConfigurationProvider.js";
import { IndexConfigurationResolver as IndexConfigurationResolverAbstraction } from "./abstractions/IndexConfigurationResolver.js";
class IndexConfigurationResolverImpl {
  provider;
  constructor(provider) {
    this.provider = provider;
  }
  resolve(indexName) {
    const base = this.getBaseConfiguration();
    return this.provider.getConfiguration(indexName, base);
  }
  getBaseConfiguration() {
    const baseConfig = getBaseConfiguration();
    return structuredClone({
      mappings: baseConfig.mappings,
      settings: baseConfig.settings
    });
  }
}
export const IndexConfigurationResolver =
  IndexConfigurationResolverAbstraction.createImplementation({
    implementation: IndexConfigurationResolverImpl,
    dependencies: [IndexConfigurationProvider]
  });
//# sourceMappingURL=IndexConfigurationResolver.js.map

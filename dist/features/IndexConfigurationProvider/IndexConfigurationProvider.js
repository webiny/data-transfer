import { IndexConfigurationProvider as IndexConfigurationProviderAbstraction } from "./abstractions/IndexConfigurationProvider.js";
class IndexConfigurationProviderImpl {
  getConfiguration(_indexName, base) {
    return base;
  }
}
export const IndexConfigurationProvider =
  IndexConfigurationProviderAbstraction.createImplementation({
    implementation: IndexConfigurationProviderImpl,
    dependencies: []
  });
//# sourceMappingURL=IndexConfigurationProvider.js.map

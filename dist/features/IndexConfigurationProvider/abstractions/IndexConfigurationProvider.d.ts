import type { OpenSearchIndexRequestBody } from "@webiny/api-opensearch/types.js";
interface IndexConfiguration {
  mappings?: OpenSearchIndexRequestBody["mappings"];
  settings?: OpenSearchIndexRequestBody["settings"];
}
export interface IIndexConfigurationProvider {
  getConfiguration(indexName: string, base: IndexConfiguration): IndexConfiguration;
}
export declare const IndexConfigurationProvider: import("@webiny/di").Abstraction<IIndexConfigurationProvider>;
export declare namespace IndexConfigurationProvider {
  type Interface = IIndexConfigurationProvider;
  type Configuration = IndexConfiguration;
}
export {};
//# sourceMappingURL=IndexConfigurationProvider.d.ts.map

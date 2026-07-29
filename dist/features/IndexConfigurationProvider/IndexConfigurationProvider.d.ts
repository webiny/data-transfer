import { IndexConfigurationProvider as IndexConfigurationProviderAbstraction } from "./abstractions/IndexConfigurationProvider.ts";
export type { IIndexConfigurationProvider } from "./abstractions/IndexConfigurationProvider.js";
declare class IndexConfigurationProviderImpl
  implements IndexConfigurationProviderAbstraction.Interface
{
  getConfiguration(
    _indexName: string,
    base: IndexConfigurationProviderAbstraction.Configuration
  ): IndexConfigurationProviderAbstraction.Configuration;
}
export declare const IndexConfigurationProvider: typeof IndexConfigurationProviderImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/IndexConfigurationProvider.ts").IIndexConfigurationProvider
  >;
};
//# sourceMappingURL=IndexConfigurationProvider.d.ts.map

import { IndexConfigurationProvider } from "./abstractions/IndexConfigurationProvider.ts";
import { IndexConfigurationResolver as IndexConfigurationResolverAbstraction } from "./abstractions/IndexConfigurationResolver.ts";
export type { IIndexConfigurationResolver } from "./abstractions/IndexConfigurationResolver.js";
declare class IndexConfigurationResolverImpl
  implements IndexConfigurationResolverAbstraction.Interface
{
  private readonly provider;
  constructor(provider: IndexConfigurationProvider.Interface);
  resolve(indexName: string): IndexConfigurationProvider.Configuration;
  private getBaseConfiguration;
}
export declare const IndexConfigurationResolver: typeof IndexConfigurationResolverImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/IndexConfigurationResolver.ts").IIndexConfigurationResolver
  >;
};
//# sourceMappingURL=IndexConfigurationResolver.d.ts.map

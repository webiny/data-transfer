import type { IndexConfigurationProvider } from "./IndexConfigurationProvider.ts";
export interface IIndexConfigurationResolver {
  resolve(indexName: string): IndexConfigurationProvider.Configuration;
}
export declare const IndexConfigurationResolver: import("@webiny/di").Abstraction<IIndexConfigurationResolver>;
export declare namespace IndexConfigurationResolver {
  type Interface = IIndexConfigurationResolver;
}
//# sourceMappingURL=IndexConfigurationResolver.d.ts.map

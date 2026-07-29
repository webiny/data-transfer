import { OpenSearchClient as OpenSearchClientAbstraction } from "./abstractions/OpenSearchClient.ts";
import { OpenSearchClientConfig } from "./abstractions/OpenSearchClientConfig.ts";
import { Logger } from "../../tools/Logger/abstractions/Logger.js";
declare class OpenSearchClientImpl implements OpenSearchClientAbstraction.Interface {
  private client;
  constructor(config: OpenSearchClientConfig.Interface, logger: Logger.Interface);
  indexExists(index: string): Promise<boolean>;
  createIndex(index: string, body?: OpenSearchClientAbstraction.CreateBody): Promise<void>;
  listIndexes(): Promise<OpenSearchClientAbstraction.Info[]>;
  putIndexSettings(index: string, settings: OpenSearchClientAbstraction.Settings): Promise<void>;
  getIndexSettings(index: string): Promise<OpenSearchClientAbstraction.SettingsResponse>;
}
export declare const OpenSearchClient: typeof OpenSearchClientImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/OpenSearchClient.ts").IOpenSearchClient
  >;
};
export {};
//# sourceMappingURL=OpenSearchClient.d.ts.map

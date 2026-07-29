export interface IndexSettings {
  index: Record<string, unknown>;
}
export interface IndexInfo {
  index?: string;
  health?: string;
  status?: string;
  [key: string]: unknown;
}
export interface IndexCreateBody {
  mappings?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}
export interface IndexSettingsResponse {
  refreshInterval?: string;
}
export interface IOpenSearchClient {
  indexExists(index: string): Promise<boolean>;
  createIndex(index: string, body?: IndexCreateBody): Promise<void>;
  listIndexes(): Promise<IndexInfo[]>;
  putIndexSettings(index: string, settings: IndexSettings): Promise<void>;
  getIndexSettings(index: string): Promise<IndexSettingsResponse>;
}
export declare const OpenSearchClient: import("@webiny/di").Abstraction<IOpenSearchClient>;
export declare namespace OpenSearchClient {
  type Interface = IOpenSearchClient;
  type Settings = IndexSettings;
  type Info = IndexInfo;
  type CreateBody = IndexCreateBody;
  type SettingsResponse = IndexSettingsResponse;
}
//# sourceMappingURL=OpenSearchClient.d.ts.map

import { createAbstraction } from "~/base/index.ts";

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Abstraction
// ============================================================================

export const OpenSearchClient = createAbstraction<IOpenSearchClient>("Core/OpenSearchClient");

export namespace OpenSearchClient {
    export type Interface = IOpenSearchClient;
    export type Settings = IndexSettings;
    export type Info = IndexInfo;
    export type CreateBody = IndexCreateBody;
    export type SettingsResponse = IndexSettingsResponse;
}

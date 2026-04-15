import { createAbstraction } from "@/src/base/index.ts";

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

// ============================================================================
// Interface
// ============================================================================

export interface IOpenSearchClient {
  /** Check if an index exists */
  indexExists(index: string): Promise<boolean>;

  /** Create an index with optional body (mappings, settings) */
  createIndex(index: string, body?: IndexCreateBody): Promise<void>;

  /** List all indexes */
  listIndexes(): Promise<IndexInfo[]>;

  /** Update settings on an index */
  putIndexSettings(index: string, settings: IndexSettings): Promise<void>;
}

// ============================================================================
// Abstraction
// ============================================================================

export const OpenSearchClient = createAbstraction<IOpenSearchClient>("Core/OpenSearchClient");

export namespace OpenSearchClient {
  export type Interface = IOpenSearchClient;
}

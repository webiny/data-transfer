import type {
  IOpenSearchClient,
  IndexSettings,
  IndexInfo,
  IndexCreateBody
} from "../../../src/features/OpenSearchClient/abstractions/OpenSearchClient.ts";

export class MockOpenSearchClient implements IOpenSearchClient {
  private indexes: Map<string, { settings: Record<string, unknown>; body?: IndexCreateBody }> =
    new Map();

  async indexExists(index: string): Promise<boolean> {
    return this.indexes.has(index);
  }

  async createIndex(index: string, body?: IndexCreateBody): Promise<void> {
    if (this.indexes.has(index)) {
      const error = new Error("resource_already_exists_exception");
      (error as any).meta = {
        body: { error: { type: "resource_already_exists_exception" } }
      };
      throw error;
    }
    this.indexes.set(index, { settings: {}, body });
  }

  async listIndexes(): Promise<IndexInfo[]> {
    return Array.from(this.indexes.keys()).map(index => ({ index }));
  }

  async putIndexSettings(index: string, settings: IndexSettings): Promise<void> {
    const existing = this.indexes.get(index);
    if (!existing) {
      throw new Error(`index_not_found: ${index}`);
    }
    existing.settings = { ...existing.settings, ...settings.index };
  }

  // Test helpers
  getIndexSettings(index: string): Record<string, unknown> | undefined {
    return this.indexes.get(index)?.settings;
  }

  getIndexCount(): number {
    return this.indexes.size;
  }

  clear(): void {
    this.indexes.clear();
  }
}

import { OpenSearchClient } from "../../../src/services/OpenSearchClient/abstractions/OpenSearchClient.ts";

export class MockOpenSearchClient implements OpenSearchClient.Interface {
    private indexes: Map<
        string,
        { settings: Record<string, unknown>; body?: OpenSearchClient.CreateBody }
    > = new Map();

    public async indexExists(index: string): Promise<boolean> {
        return this.indexes.has(index);
    }

    public async createIndex(index: string, body?: OpenSearchClient.CreateBody): Promise<void> {
        if (this.indexes.has(index)) {
            const error = new Error("resource_already_exists_exception");
            (error as any).meta = {
                body: { error: { type: "resource_already_exists_exception" } }
            };
            throw error;
        }
        this.indexes.set(index, { settings: {}, body });
    }

    public async listIndexes(): Promise<OpenSearchClient.Info[]> {
        return Array.from(this.indexes.keys()).map(index => ({ index }));
    }

    public async putIndexSettings(
        index: string,
        settings: OpenSearchClient.Settings
    ): Promise<void> {
        const existing = this.indexes.get(index);
        if (!existing) {
            throw new Error(`index_not_found: ${index}`);
        }
        existing.settings = { ...existing.settings, ...settings.index };
    }

    public async getIndexSettings(index: string): Promise<OpenSearchClient.SettingsResponse> {
        const existing = this.indexes.get(index);
        if (!existing) {
            throw new Error(`index_not_found: ${index}`);
        }
        const refreshInterval = existing.settings.refresh_interval as string | undefined;
        return {
            refreshInterval
        };
    }

    // Test helpers (not part of the interface)
    public peekSettings(index: string): Record<string, unknown> | undefined {
        return this.indexes.get(index)?.settings;
    }

    public getIndexCount(): number {
        return this.indexes.size;
    }

    public clear(): void {
        this.indexes.clear();
    }
}

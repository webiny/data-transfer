import { TouchedIndexes as TouchedIndexesAbstraction } from "./abstractions/TouchedIndexes.ts";

export type { ITouchedIndexes } from "./abstractions/TouchedIndexes.js";

class TouchedIndexesImpl implements TouchedIndexesAbstraction.Interface {
    private readonly items: Map<string, string> = new Map();

    public has(indexName: string): boolean {
        return this.items.has(indexName);
    }

    public record(indexName: string, originalRefresh: string): void {
        this.items.set(indexName, originalRefresh);
    }

    public all(): TouchedIndexesAbstraction.Item[] {
        return Array.from(this.items, ([indexName, originalRefresh]) => ({
            indexName,
            originalRefresh
        }));
    }
}

export const TouchedIndexes = TouchedIndexesAbstraction.createImplementation({
    implementation: TouchedIndexesImpl,
    dependencies: []
});

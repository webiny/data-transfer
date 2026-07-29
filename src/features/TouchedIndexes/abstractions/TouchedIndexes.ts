import { createAbstraction } from "~/base/index.js";

export interface ITouchedIndex {
    indexName: string;
    originalRefresh: string;
}

export interface ITouchedIndexes {
    has(indexName: string): boolean;
    record(indexName: string, originalRefresh: string): void;
    all(): ITouchedIndex[];
}

export const TouchedIndexes = createAbstraction<ITouchedIndexes>("Core/TouchedIndexes");

export namespace TouchedIndexes {
    export type Interface = ITouchedIndexes;
    export type Item = ITouchedIndex;
}

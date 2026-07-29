export interface ITouchedIndex {
  indexName: string;
  originalRefresh: string;
}
export interface ITouchedIndexes {
  has(indexName: string): boolean;
  record(indexName: string, originalRefresh: string): void;
  all(): ITouchedIndex[];
}
export declare const TouchedIndexes: import("@webiny/di").Abstraction<ITouchedIndexes>;
export declare namespace TouchedIndexes {
  type Interface = ITouchedIndexes;
  type Item = ITouchedIndex;
}
//# sourceMappingURL=TouchedIndexes.d.ts.map

import { TouchedIndexes as TouchedIndexesAbstraction } from "./abstractions/TouchedIndexes.ts";
export type { ITouchedIndexes } from "./abstractions/TouchedIndexes.js";
declare class TouchedIndexesImpl implements TouchedIndexesAbstraction.Interface {
  private readonly items;
  has(indexName: string): boolean;
  record(indexName: string, originalRefresh: string): void;
  all(): TouchedIndexesAbstraction.Item[];
}
export declare const TouchedIndexes: typeof TouchedIndexesImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/TouchedIndexes.ts").ITouchedIndexes
  >;
};
//# sourceMappingURL=TouchedIndexes.d.ts.map

import { TouchedIndexes as TouchedIndexesAbstraction } from "./abstractions/TouchedIndexes.js";
class TouchedIndexesImpl {
  items = new Map();
  has(indexName) {
    return this.items.has(indexName);
  }
  record(indexName, originalRefresh) {
    this.items.set(indexName, originalRefresh);
  }
  all() {
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
//# sourceMappingURL=TouchedIndexes.js.map

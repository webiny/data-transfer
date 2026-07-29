import { Cache as CacheAbstraction } from "./abstractions/Cache.js";
class InMemoryCacheImpl {
  store = new Map();
  get(key) {
    return this.store.get(key);
  }
  set(key, value) {
    this.store.set(key, value);
  }
  has(key) {
    return this.store.has(key);
  }
  delete(key) {
    return this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
  size() {
    return this.store.size;
  }
}
export const InMemoryCache = CacheAbstraction.createImplementation({
  implementation: InMemoryCacheImpl,
  dependencies: []
});
//# sourceMappingURL=InMemoryCache.js.map

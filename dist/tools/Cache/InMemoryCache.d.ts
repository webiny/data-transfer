import { Cache as CacheAbstraction } from "./abstractions/Cache.ts";
export type { ICache } from "./abstractions/Cache.js";
declare class InMemoryCacheImpl implements CacheAbstraction.Interface {
  private store;
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
}
export declare const InMemoryCache: typeof InMemoryCacheImpl & {
  __abstraction: import("@webiny/di").Abstraction<import("./abstractions/Cache.ts").ICache>;
};
//# sourceMappingURL=InMemoryCache.d.ts.map

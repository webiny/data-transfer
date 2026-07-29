export interface ICache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
}
export declare const Cache: import("@webiny/di").Abstraction<ICache>;
export declare namespace Cache {
  type Interface = ICache;
}
//# sourceMappingURL=Cache.d.ts.map

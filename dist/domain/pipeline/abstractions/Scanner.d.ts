export interface IScanner<TRecord = unknown, TShard = unknown> {
  listShards(): Promise<TShard[]>;
  scan(shard: TShard): AsyncIterable<TRecord>;
}
export declare const Scanner: import("@webiny/di").Abstraction<IScanner<unknown, unknown>>;
export declare namespace Scanner {
  type Interface<TRecord = unknown, TShard = unknown> = IScanner<TRecord, TShard>;
}
//# sourceMappingURL=Scanner.d.ts.map

import { createAbstraction } from "~/base/index.js";

interface IScanner<TRecord = unknown, TShard = unknown> {
    listShards(): Promise<TShard[]>;
    scan(shard: TShard): AsyncIterable<TRecord>;
}

export const Scanner = createAbstraction<IScanner>("Core/Scanner");

export namespace Scanner {
    export type Interface<TRecord = unknown, TShard = unknown> = IScanner<TRecord, TShard>;
}

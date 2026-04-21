export interface Filter<TRecord> {
    readonly kind: "filter";
    readonly check: (record: TRecord) => boolean;
}

export function createFilter<TRecord>(predicate: (record: TRecord) => boolean): Filter<TRecord> {
    return {
        kind: "filter",
        check: predicate
    };
}

export interface Filter<TRecord> {
    readonly kind: "filter";
    readonly check: (record: TRecord) => boolean | Promise<boolean>;
}

export function createFilter<TRecord>(
    predicate: (record: TRecord) => boolean | Promise<boolean>
): Filter<TRecord> {
    return {
        kind: "filter",
        check: predicate
    };
}

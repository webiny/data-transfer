export interface Filter<TRecord> {
  readonly kind: "filter";
  readonly check: (record: TRecord) => boolean | Promise<boolean>;
}
export declare function createFilter<TRecord>(
  predicate: (record: TRecord) => boolean | Promise<boolean>
): Filter<TRecord>;
//# sourceMappingURL=Filter.d.ts.map

// Drained by whichever persistence processor is active in the pipeline:
// DdbProcessor writes directly to the target DDB table; OsProcessor wraps the
// write with gzip + ensureIndex and delegates to the shared DdbExecutor. Both
// contribute the same `putRecord` slice key, so TypeScript's DisjointKeys
// rejects `[DdbProcessor, OsProcessor]` in one pipeline at compile time. The
// runtime also enforces mutual exclusion via the `storage` mode check inside
// each processor's extendContext — a safety belt for dynamic processor lists
// that bypass the type system.
export class PutRecord {
  table;
  record;
  static key = "PUT_RECORD";
  key = PutRecord.key;
  dedupKey = undefined;
  constructor(table, record) {
    this.table = table;
    this.record = record;
  }
  static create(params) {
    return new PutRecord(params.table, params.record);
  }
}
//# sourceMappingURL=PutRecord.js.map

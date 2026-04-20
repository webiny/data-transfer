import type { Command } from "./Command.ts";

interface CreateParams {
    table: string;
    record: Record<string, unknown>;
}

// Drained by whichever persistence processor is active in the pipeline:
// DdbProcessor writes directly to the target DDB table; OsProcessor wraps the
// write with gzip + ensureIndex and delegates to the shared DdbExecutor. Both
// contribute the same `putRecord` slice key, so TypeScript's DisjointKeys
// rejects `[DdbProcessor, OsProcessor]` in one pipeline at compile time. The
// runtime also enforces mutual exclusion via the `storage` mode check inside
// each processor's extendContext — a safety belt for dynamic processor lists
// that bypass the type system.
export class PutRecord implements Command {
    public static readonly key = "PUT_RECORD";

    public readonly key = PutRecord.key;
    public readonly dedupKey: undefined = undefined;

    private constructor(
        public readonly table: string,
        public readonly record: Record<string, unknown>
    ) {}

    public static create(params: CreateParams): PutRecord {
        return new PutRecord(params.table, params.record);
    }
}

import type { Command } from "./Command.ts";

interface CreateParams {
    table: string;
    record: Record<string, unknown>;
}

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

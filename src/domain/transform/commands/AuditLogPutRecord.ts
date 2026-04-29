import type { Command } from "./Command.ts";

interface CreateParams {
    table: string;
    record: Record<string, unknown>;
}

export class AuditLogPutRecord implements Command {
    public static readonly key = "AUDIT_LOG_PUT_RECORD";

    public readonly key = AuditLogPutRecord.key;
    public readonly dedupKey: undefined = undefined;

    private constructor(
        public readonly table: string,
        public readonly record: Record<string, unknown>
    ) {}

    public static create(params: CreateParams): AuditLogPutRecord {
        return new AuditLogPutRecord(params.table, params.record);
    }
}

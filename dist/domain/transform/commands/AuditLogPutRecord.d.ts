import type { Command } from "./Command.ts";
interface CreateParams {
  table: string;
  record: Record<string, unknown>;
}
export declare class AuditLogPutRecord implements Command {
  readonly table: string;
  readonly record: Record<string, unknown>;
  static readonly key = "AUDIT_LOG_PUT_RECORD";
  readonly key = "AUDIT_LOG_PUT_RECORD";
  readonly dedupKey: undefined;
  private constructor();
  static create(params: CreateParams): AuditLogPutRecord;
}
export {};
//# sourceMappingURL=AuditLogPutRecord.d.ts.map

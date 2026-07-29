import type { Command } from "./Command.ts";
interface CreateParams {
  table: string;
  record: Record<string, unknown>;
}
export declare class PutRecord implements Command {
  readonly table: string;
  readonly record: Record<string, unknown>;
  static readonly key = "PUT_RECORD";
  readonly key = "PUT_RECORD";
  readonly dedupKey: undefined;
  private constructor();
  static create(params: CreateParams): PutRecord;
}
export {};
//# sourceMappingURL=PutRecord.d.ts.map

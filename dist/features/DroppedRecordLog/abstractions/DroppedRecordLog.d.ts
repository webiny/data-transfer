import type { RecordDisposition } from "../../../domain/pipeline/RecordDisposition.js";
export interface IDroppedRecordLog {
  add(
    record: unknown,
    disposition: RecordDisposition.Blackholed | RecordDisposition.Unmatched
  ): void;
  flush(segment: number): void;
}
export declare const DroppedRecordLog: import("@webiny/di").Abstraction<IDroppedRecordLog>;
export declare namespace DroppedRecordLog {
  type Interface = IDroppedRecordLog;
}
//# sourceMappingURL=DroppedRecordLog.d.ts.map

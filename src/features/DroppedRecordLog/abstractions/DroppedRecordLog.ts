import { createAbstraction } from "~/base/index.js";
import type { RecordDisposition } from "~/domain/pipeline/RecordDisposition.js";

interface IDroppedRecordLog {
    add(
        record: unknown,
        disposition: RecordDisposition.Blackholed | RecordDisposition.Unmatched
    ): void;
    flush(segment: number): void;
}

export const DroppedRecordLog = createAbstraction<IDroppedRecordLog>("Core/DroppedRecordLog");

export namespace DroppedRecordLog {
    export type Interface = IDroppedRecordLog;
}

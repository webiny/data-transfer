import { DroppedRecordLog } from "~/features/DroppedRecordLog/abstractions/DroppedRecordLog.js";
import type { RecordDisposition } from "~/domain/pipeline/index.js";

export class MockDroppedRecordLog implements DroppedRecordLog.Interface {
    public readonly entries: Array<{
        record: unknown;
        disposition: RecordDisposition.Blackholed | RecordDisposition.Unmatched;
    }> = [];
    public readonly flushedSegments: number[] = [];

    public add(
        record: unknown,
        disposition: RecordDisposition.Blackholed | RecordDisposition.Unmatched
    ): void {
        this.entries.push({ record, disposition });
    }

    public flush(segment: number): void {
        this.flushedSegments.push(segment);
    }

    public clear(): void {
        this.entries.length = 0;
        this.flushedSegments.length = 0;
    }
}

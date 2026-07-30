import { TransferredRecordLog } from "~/features/TransferredRecordLog/abstractions/TransferredRecordLog.js";

export class MockTransferredRecordLog implements TransferredRecordLog.Interface {
    public readonly entries: Array<{ record: unknown; pipelineName: string }> = [];
    public readonly flushedSegments: number[] = [];

    public add(record: unknown, pipelineName: string): void {
        this.entries.push({ record, pipelineName });
    }

    public flush(segment: number): void {
        this.flushedSegments.push(segment);
    }

    public clear(): void {
        this.entries.length = 0;
        this.flushedSegments.length = 0;
    }
}

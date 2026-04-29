import { createAbstraction } from "~/base/index.ts";

interface ITransferredRecordLog {
    add(record: unknown, pipelineName: string): void;
    flush(segment: number): void;
}

export const TransferredRecordLog = createAbstraction<ITransferredRecordLog>(
    "Core/TransferredRecordLog"
);

export namespace TransferredRecordLog {
    export type Interface = ITransferredRecordLog;
}

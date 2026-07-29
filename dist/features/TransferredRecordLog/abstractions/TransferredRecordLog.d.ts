export interface ITransferredRecordLog {
  add(record: unknown, pipelineName: string): void;
  flush(segment: number): void;
}
export declare const TransferredRecordLog: import("@webiny/di").Abstraction<ITransferredRecordLog>;
export declare namespace TransferredRecordLog {
  type Interface = ITransferredRecordLog;
}
//# sourceMappingURL=TransferredRecordLog.d.ts.map

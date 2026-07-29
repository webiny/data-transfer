import { TransferredRecordLog as TransferredRecordLogAbstraction } from "./abstractions/TransferredRecordLog.ts";
import { TransferContext } from "../../features/TransferLifecycle/abstractions/TransferContext.js";
import { DirectoryTool } from "../../tools/DirectoryTool/abstractions/DirectoryTool.js";
import { FileTool } from "../../tools/FileTool/abstractions/FileTool.js";
export type { ITransferredRecordLog } from "./abstractions/TransferredRecordLog.js";
declare class TransferredRecordLogImpl implements TransferredRecordLogAbstraction.Interface {
  private readonly transferContext;
  private readonly dirTool;
  private readonly fileTool;
  private readonly buffer;
  constructor(
    transferContext: TransferContext.Interface,
    dirTool: DirectoryTool.Interface,
    fileTool: FileTool.Interface
  );
  add(record: unknown, pipelineName: string): void;
  flush(segment: number): void;
  private formatLine;
}
export declare const TransferredRecordLog: typeof TransferredRecordLogImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/TransferredRecordLog.ts").ITransferredRecordLog
  >;
};
//# sourceMappingURL=TransferredRecordLog.d.ts.map

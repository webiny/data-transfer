import { DroppedRecordLog as DroppedRecordLogAbstraction } from "./abstractions/DroppedRecordLog.ts";
import { TransferContext } from "../../features/TransferLifecycle/abstractions/TransferContext.js";
import { DirectoryTool } from "../../tools/DirectoryTool/abstractions/DirectoryTool.js";
import { FileTool } from "../../tools/FileTool/abstractions/FileTool.js";
import { RecordDisposition } from "../../domain/pipeline/RecordDisposition.js";
export type { IDroppedRecordLog } from "./abstractions/DroppedRecordLog.js";
declare class DroppedRecordLogImpl implements DroppedRecordLogAbstraction.Interface {
  private readonly transferContext;
  private readonly dirTool;
  private readonly fileTool;
  private readonly blackholed;
  private readonly unmatched;
  constructor(
    transferContext: TransferContext.Interface,
    dirTool: DirectoryTool.Interface,
    fileTool: FileTool.Interface
  );
  add(
    record: unknown,
    disposition: RecordDisposition.Blackholed | RecordDisposition.Unmatched
  ): void;
  flush(segment: number): void;
  private formatLine;
}
export declare const DroppedRecordLog: typeof DroppedRecordLogImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/DroppedRecordLog.ts").IDroppedRecordLog
  >;
};
//# sourceMappingURL=DroppedRecordLog.d.ts.map

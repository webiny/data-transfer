import { join } from "node:path";
import { DroppedRecordLog as DroppedRecordLogAbstraction } from "./abstractions/DroppedRecordLog.js";
import { TransferContext } from "../../features/TransferLifecycle/abstractions/TransferContext.js";
import { DirectoryTool } from "../../tools/DirectoryTool/abstractions/DirectoryTool.js";
import { FileTool } from "../../tools/FileTool/abstractions/FileTool.js";
import { RecordDisposition } from "../../domain/pipeline/RecordDisposition.js";
class DroppedRecordLogImpl {
  transferContext;
  dirTool;
  fileTool;
  blackholed = [];
  unmatched = [];
  constructor(transferContext, dirTool, fileTool) {
    this.transferContext = transferContext;
    this.dirTool = dirTool;
    this.fileTool = fileTool;
  }
  add(record, disposition) {
    const line = this.formatLine(record);
    if (disposition instanceof RecordDisposition.Blackholed) {
      this.blackholed.push(line);
    } else {
      this.unmatched.push(line);
    }
  }
  flush(segment) {
    const dir = join(process.cwd(), ".transfer", this.transferContext.runId);
    if (this.blackholed.length > 0) {
      this.dirTool.create(dir);
      this.fileTool.writeFileOrThrow(
        join(dir, `segment-${segment}-blackholed.log`),
        this.blackholed.join("\n") + "\n"
      );
      this.blackholed.length = 0;
    }
    if (this.unmatched.length > 0) {
      this.dirTool.create(dir);
      this.fileTool.writeFileOrThrow(
        join(dir, `segment-${segment}-unmatched.log`),
        this.unmatched.join("\n") + "\n"
      );
      this.unmatched.length = 0;
    }
  }
  formatLine(record) {
    const r = record;
    const data = r.data;
    const modelId = r.modelId ?? data?.modelId;
    const pk = r.PK ?? "";
    const sk = r.SK ?? "";
    const type = r.TYPE ?? "?";
    return modelId ? `[${modelId}] ${pk} : ${sk} : ${type}` : `[${type}] ${pk} : ${sk}`;
  }
}
export const DroppedRecordLog = DroppedRecordLogAbstraction.createImplementation({
  implementation: DroppedRecordLogImpl,
  dependencies: [TransferContext, DirectoryTool, FileTool]
});
//# sourceMappingURL=DroppedRecordLog.js.map

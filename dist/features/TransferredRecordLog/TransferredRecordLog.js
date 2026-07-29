import { join } from "node:path";
import { TransferredRecordLog as TransferredRecordLogAbstraction } from "./abstractions/TransferredRecordLog.js";
import { TransferContext } from "../../features/TransferLifecycle/abstractions/TransferContext.js";
import { DirectoryTool } from "../../tools/DirectoryTool/abstractions/DirectoryTool.js";
import { FileTool } from "../../tools/FileTool/abstractions/FileTool.js";
class TransferredRecordLogImpl {
  transferContext;
  dirTool;
  fileTool;
  buffer = [];
  constructor(transferContext, dirTool, fileTool) {
    this.transferContext = transferContext;
    this.dirTool = dirTool;
    this.fileTool = fileTool;
  }
  add(record, pipelineName) {
    this.buffer.push(this.formatLine(record, pipelineName));
  }
  flush(segment) {
    if (this.buffer.length === 0) {
      return;
    }
    const dir = join(process.cwd(), ".transfer", this.transferContext.runId);
    this.dirTool.create(dir);
    const path = join(dir, `segment-${segment}-transferred.log`);
    this.fileTool.writeFileOrThrow(path, this.buffer.join("\n") + "\n");
    this.buffer.length = 0;
  }
  formatLine(record, pipelineName) {
    const r = record;
    const data = r.data;
    const modelId = r.modelId ?? data?.modelId;
    const pk = r.PK ?? "";
    const sk = r.SK ?? "";
    const type = r.TYPE ?? "?";
    const body = modelId ? `[${modelId}] ${pk} : ${sk} : ${type}` : `[${type}] ${pk} : ${sk}`;
    return `[TRANSFERRED:${pipelineName}] ${body}`;
  }
}
export const TransferredRecordLog = TransferredRecordLogAbstraction.createImplementation({
  implementation: TransferredRecordLogImpl,
  dependencies: [TransferContext, DirectoryTool, FileTool]
});
//# sourceMappingURL=TransferredRecordLog.js.map

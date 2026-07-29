import { join } from "node:path";
import { TransferredRecordLog as TransferredRecordLogAbstraction } from "./abstractions/TransferredRecordLog.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.js";
import { DirectoryTool } from "~/tools/DirectoryTool/abstractions/DirectoryTool.js";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.js";

class TransferredRecordLogImpl implements TransferredRecordLogAbstraction.Interface {
    private readonly buffer: string[] = [];

    public constructor(
        private readonly transferContext: TransferContext.Interface,
        private readonly dirTool: DirectoryTool.Interface,
        private readonly fileTool: FileTool.Interface
    ) {}

    public add(record: unknown, pipelineName: string): void {
        this.buffer.push(this.formatLine(record, pipelineName));
    }

    public flush(segment: number): void {
        if (this.buffer.length === 0) {
            return;
        }
        const dir = join(process.cwd(), ".transfer", this.transferContext.runId);
        this.dirTool.create(dir);
        const path = join(dir, `segment-${segment}-transferred.log`);
        this.fileTool.writeFileOrThrow(path, this.buffer.join("\n") + "\n");
        this.buffer.length = 0;
    }

    private formatLine(record: unknown, pipelineName: string): string {
        const r = record as Record<string, unknown>;
        const data = r.data as Record<string, unknown> | undefined;
        const modelId = (r.modelId ?? data?.modelId) as string | undefined;
        const pk = (r.PK ?? "") as string;
        const sk = (r.SK ?? "") as string;
        const type = (r.TYPE ?? "?") as string;
        const body = modelId ? `[${modelId}] ${pk} : ${sk} : ${type}` : `[${type}] ${pk} : ${sk}`;
        return `[TRANSFERRED:${pipelineName}] ${body}`;
    }
}

export const TransferredRecordLog = TransferredRecordLogAbstraction.createImplementation({
    implementation: TransferredRecordLogImpl,
    dependencies: [TransferContext, DirectoryTool, FileTool]
});

import { join } from "node:path";
import { DroppedRecordLog as DroppedRecordLogAbstraction } from "./abstractions/DroppedRecordLog.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import { DirectoryTool } from "~/tools/DirectoryTool/abstractions/DirectoryTool.ts";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.ts";
import { RecordDisposition } from "~/domain/pipeline/RecordDisposition.ts";

class DroppedRecordLogImpl implements DroppedRecordLogAbstraction.Interface {
    private readonly buffer: string[] = [];

    public constructor(
        private readonly transferContext: TransferContext.Interface,
        private readonly dirTool: DirectoryTool.Interface,
        private readonly fileTool: FileTool.Interface
    ) {}

    public add(
        record: unknown,
        disposition: RecordDisposition.Blackholed | RecordDisposition.Unmatched
    ): void {
        this.buffer.push(this.formatLine(record, disposition));
    }

    public flush(segment: number): void {
        if (this.buffer.length === 0) {
            return;
        }
        const dir = join(process.cwd(), ".transfer", this.transferContext.runId);
        this.dirTool.create(dir);
        const path = join(dir, `segment-${segment}-dropped.log`);
        this.fileTool.writeFileOrThrow(path, this.buffer.join("\n") + "\n");
        this.buffer.length = 0;
    }

    private formatLine(
        record: unknown,
        disposition: RecordDisposition.Blackholed | RecordDisposition.Unmatched
    ): string {
        const r = record as Record<string, unknown>;
        const data = r.data as Record<string, unknown> | undefined;
        const modelId = (r.modelId ?? data?.modelId) as string | undefined;
        const pk = (r.PK ?? "") as string;
        const sk = (r.SK ?? "") as string;
        const type = (r.TYPE ?? "?") as string;
        const tag =
            disposition instanceof RecordDisposition.Blackholed ? "BLACKHOLED" : "UNMATCHED";
        const body = modelId
            ? `[${modelId}] ${pk} : ${sk} : ${type}`
            : `[${type}] ${pk} : ${sk}`;
        return `[${tag}] ${body}`;
    }
}

export const DroppedRecordLog = DroppedRecordLogAbstraction.createImplementation({
    implementation: DroppedRecordLogImpl,
    dependencies: [TransferContext, DirectoryTool, FileTool]
});

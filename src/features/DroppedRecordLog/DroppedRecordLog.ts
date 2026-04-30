import { join } from "node:path";
import { DroppedRecordLog as DroppedRecordLogAbstraction } from "./abstractions/DroppedRecordLog.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import { DirectoryTool } from "~/tools/DirectoryTool/abstractions/DirectoryTool.ts";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.ts";
import { RecordDisposition } from "~/domain/pipeline/RecordDisposition.ts";

class DroppedRecordLogImpl implements DroppedRecordLogAbstraction.Interface {
    private readonly blackholed: string[] = [];
    private readonly unmatched: string[] = [];

    public constructor(
        private readonly transferContext: TransferContext.Interface,
        private readonly dirTool: DirectoryTool.Interface,
        private readonly fileTool: FileTool.Interface
    ) {}

    public add(
        record: unknown,
        disposition: RecordDisposition.Blackholed | RecordDisposition.Unmatched
    ): void {
        const line = this.formatLine(record);
        if (disposition instanceof RecordDisposition.Blackholed) {
            this.blackholed.push(line);
        } else {
            this.unmatched.push(line);
        }
    }

    public flush(segment: number): void {
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

    private formatLine(record: unknown): string {
        const r = record as Record<string, unknown>;
        const data = r.data as Record<string, unknown> | undefined;
        const modelId = (r.modelId ?? data?.modelId) as string | undefined;
        const pk = (r.PK ?? "") as string;
        const sk = (r.SK ?? "") as string;
        const type = (r.TYPE ?? "?") as string;
        return modelId ? `[${modelId}] ${pk} : ${sk} : ${type}` : `[${type}] ${pk} : ${sk}`;
    }
}

export const DroppedRecordLog = DroppedRecordLogAbstraction.createImplementation({
    implementation: DroppedRecordLogImpl,
    dependencies: [TransferContext, DirectoryTool, FileTool]
});

import { join } from "node:path";
import { ChangeReport as ChangeReportAbstraction } from "./abstractions/ChangeReport.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.js";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.js";

export type { IChangeReport } from "./abstractions/ChangeReport.js";

const REPORT_FILE_NAME = "fix-live-report.jsonl";

interface ChangeLine extends ChangeReportAbstraction.Change {
    kind: "change";
}

interface SkipLine extends ChangeReportAbstraction.Skip {
    kind: "skip";
}

type ReportLine = ChangeLine | SkipLine;

class JsonlChangeReportImpl implements ChangeReportAbstraction.Interface {
    public readonly path: string;

    public constructor(
        transferContext: TransferContext.Interface,
        private readonly fileTool: FileTool.Interface
    ) {
        this.path = join(process.cwd(), ".transfer", transferContext.runId, REPORT_FILE_NAME);
    }

    public change(entry: ChangeReportAbstraction.Change): void {
        this.append({
            kind: "change",
            table: entry.table,
            pk: entry.pk,
            sk: entry.sk,
            reason: entry.reason,
            before: entry.before === undefined ? null : entry.before,
            after: entry.after,
            result: entry.result
        });
    }

    public skip(entry: ChangeReportAbstraction.Skip): void {
        this.append({
            kind: "skip",
            table: entry.table,
            pk: entry.pk,
            sk: entry.sk,
            reason: entry.reason,
            detail: entry.detail
        });
    }

    private append(line: ReportLine): void {
        this.fileTool.appendLineOrThrow(this.path, JSON.stringify(line));
    }
}

export const ChangeReport = ChangeReportAbstraction.createImplementation({
    implementation: JsonlChangeReportImpl,
    dependencies: [TransferContext, FileTool]
});

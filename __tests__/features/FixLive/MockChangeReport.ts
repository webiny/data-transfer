import type { ChangeReport } from "~/features/FixLive/abstractions/ChangeReport.js";

export class MockChangeReport implements ChangeReport.Interface {
    public readonly path = "/dev/null/fix-live-report.jsonl";
    public readonly changes: ChangeReport.Change[] = [];
    public readonly skips: ChangeReport.Skip[] = [];

    public change(entry: ChangeReport.Change): void {
        this.changes.push(entry);
    }

    public skip(entry: ChangeReport.Skip): void {
        this.skips.push(entry);
    }
}

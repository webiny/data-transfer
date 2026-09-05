import type { UI } from "~/commands/prompts/abstractions/UI.js";
import type { ChangeReport, LiveFieldRunner } from "~/features/FixLive/index.js";
import type { TableKind } from "../types.ts";
import { formatCount } from "./format.ts";

export interface RunTableInput {
    table: TableKind;
    tableName: string;
    region: string;
    runner: LiveFieldRunner.Interface;
    target: LiveFieldRunner.Target;
    mode: LiveFieldRunner.Mode;
    report: ChangeReport.Interface;
    ui: UI.Interface;
}

export interface TableRunResult {
    table: TableKind;
    tableName: string;
    region: string;
    stats: LiveFieldRunner.Stats;
}

export const tableLabel = (table: TableKind): string =>
    table === "ddb" ? "DynamoDB" : "OpenSearch";

export async function runTable(input: RunTableInput): Promise<TableRunResult> {
    const label = tableLabel(input.table);
    const spinner = input.ui.spinner();
    spinner.start(`Scanning ${label}…`);

    const stats = await input.runner.run({
        mode: input.mode,
        target: input.target,
        report: input.report,
        onProgress: progress => {
            spinner.message(
                `Scanning ${label}… ${formatCount(progress.scanned)} rows / ${formatCount(progress.entries)} entries`
            );
        }
    });

    spinner.stop(
        `${label} scanned: ${formatCount(stats.scanned)} rows / ${formatCount(stats.entries)} entries`
    );
    return {
        table: input.table,
        tableName: input.tableName,
        region: input.region,
        stats
    };
}

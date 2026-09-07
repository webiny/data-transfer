import type { UI } from "~/commands/prompts/abstractions/UI.js";
import type { FixLiveState, LiveFieldRunner } from "~/features/FixLive/index.js";
import type { SystemName } from "../types.ts";
import { formatCount } from "./format.ts";
import { tableLabel, type TableRunResult } from "./runTable.ts";

export interface SummaryInput {
    project: string;
    system: SystemName;
    mode: LiveFieldRunner.Mode;
    results: TableRunResult[];
    reportPath: string;
    statePath: string;
}

export interface SummariseInput extends SummaryInput {
    ui: UI.Interface;
    lastDryRun?: FixLiveState.RunSummary;
}

const sum = (counts: Record<string, number>): number =>
    Object.values(counts).reduce((total, count) => total + count, 0);

const breakdown = (counts: Record<string, number>): string =>
    Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([reason, count]) => `${reason} ${formatCount(count)}`)
        .join(" · ");

const row = (label: string, value: number, detail = ""): string => {
    const line = `    ${label.padEnd(14)} ${formatCount(value).padStart(9)}`;
    return detail ? `${line}   ${detail}` : line;
};

export const totalChanges = (results: TableRunResult[]): number =>
    results.reduce((total, result) => total + sum(result.stats.changes), 0);

export const totalSkips = (results: TableRunResult[]): number =>
    results.reduce((total, result) => total + sum(result.stats.skips), 0);

export function formatSummary(input: SummaryInput): string {
    const modeLabel = input.mode === "dry-run" ? "dry run" : "live run";
    const lines: string[] = [
        `Fix live field — ${modeLabel} (project: ${input.project}, system: ${input.system})`,
        ""
    ];
    for (const result of input.results) {
        const { stats } = result;
        lines.push(`  ${tableLabel(result.table)}  ${result.tableName} (${result.region})`);
        lines.push(row("scanned", stats.scanned));
        lines.push(row("cms entries", stats.entries));
        lines.push(row("changes", sum(stats.changes), breakdown(stats.changes)));
        lines.push(row("skips", sum(stats.skips), breakdown(stats.skips)));
        if (input.mode === "live") {
            lines.push(row("written", stats.written));
            lines.push(row("changed during run", stats.conditionFailed));
        }
        lines.push("");
    }
    lines.push(`Report: ${input.reportPath}`);
    lines.push(`State:  ${input.statePath}`);
    if (input.mode === "dry-run") {
        lines.push("");
        lines.push('Run again and choose "live" to apply these changes.');
    }
    return lines.join("\n");
}

export function summarise(input: SummariseInput): void {
    if (input.mode === "live" && input.lastDryRun) {
        const found = totalChanges(input.results);
        if (found !== input.lastDryRun.changes) {
            input.ui.warn(
                `Last dry run reported ${formatCount(input.lastDryRun.changes)} changes, this live run found ${formatCount(found)}.`
            );
        }
    }
    input.ui.note(formatSummary(input), "Summary");
    input.ui.outro("Done.");
}

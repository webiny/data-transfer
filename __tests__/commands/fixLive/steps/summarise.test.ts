import { describe, it, expect } from "vitest";
import { formatSummary, summarise, totalChanges } from "~/commands/fixLive/steps/summarise.js";
import { StubUI } from "../../prompts/StubUI.ts";
import { STATS } from "./runTable.test.ts";

const results = [
    {
        table: "ddb" as const,
        tableName: "acme-prod-ddb",
        region: "eu-central-1",
        stats: STATS
    },
    {
        table: "os" as const,
        tableName: "acme-prod-os",
        region: "eu-central-1",
        stats: { ...STATS, scanned: 62880 }
    }
];

describe("formatSummary", () => {
    it("renders one block per table with counts and non-zero breakdowns", () => {
        const text = formatSummary({
            project: "acme",
            system: "target",
            mode: "dry-run",
            results,
            reportPath: ".transfer/1/fix-live-report.jsonl",
            statePath: ".transfer/state/fix-live/acme__target.json"
        });
        expect(text).toContain("Fix live field — dry run (project: acme, system: target)");
        expect(text).toContain("DynamoDB  acme-prod-ddb (eu-central-1)");
        expect(text).toContain("scanned          148 203");
        expect(text).toContain(
            "changes            2 118   missing-live 1 902 · empty-live 201 · wrong-version 9 · stale-live 6"
        );
        expect(text).toContain(
            "skips                  4   invalid-version 1 · revision-version-mismatch 3"
        );
        expect(text).toContain("OpenSearch  acme-prod-os (eu-central-1)");
        expect(text).toContain("Report: .transfer/1/fix-live-report.jsonl");
        expect(text).toContain('Run again and choose "live" to apply these changes.');
    });

    it("live mode shows written / condition-failed instead of the dry-run hint", () => {
        const text = formatSummary({
            project: "acme",
            system: "target",
            mode: "live",
            results: [
                {
                    ...results[0]!,
                    stats: { ...STATS, written: 2100, conditionFailed: 18 }
                }
            ],
            reportPath: "r",
            statePath: "s"
        });
        expect(text).toContain("written            2 100");
        expect(text).toContain("changed during run        18");
        expect(text).not.toContain('choose "live"');
    });
});

describe("summarise", () => {
    it("warns when a live run's change count differs from the last dry run", () => {
        const ui = new StubUI();
        summarise({
            ui,
            project: "acme",
            system: "target",
            mode: "live",
            results,
            reportPath: "r",
            statePath: "s",
            lastDryRun: {
                runId: "0",
                at: "2026-09-04T09:12:00.000Z",
                changes: 2118,
                skips: 4
            }
        });
        expect(totalChanges(results)).toBe(4236);
        expect(ui.warns[0]).toBe("Last dry run reported 2 118 changes, this live run found 4 236.");
        expect(ui.notes[0]!.title).toBe("Summary");
        expect(ui.outros).toEqual(["Done."]);
    });
});

import { describe, it, expect } from "vitest";
import type { LiveFieldRunner, ChangeReport } from "~/features/FixLive/index.js";
import { runTable } from "~/commands/fixLive/steps/runTable.js";
import { StubUI } from "../../prompts/StubUI.ts";
import { MockDynamoDbClient } from "../../../services/DynamoDbClient/MockDynamoDbClient.ts";

export const STATS: LiveFieldRunner.Stats = {
    scanned: 148203,
    entries: 31440,
    changes: {
        "missing-live": 1902,
        "empty-live": 201,
        "wrong-version": 9,
        "stale-live": 6
    },
    skips: {
        "no-latest-record": 0,
        "invalid-version": 1,
        "revision-record-missing": 0,
        "revision-version-mismatch": 3,
        "latest-status-contradicts-published": 0,
        "latest-status-contradicts-unpublished": 0,
        "decompress-failed": 0,
        "changed-during-run": 0
    },
    written: 0,
    conditionFailed: 0
};

export const fakeRunner = (stats: LiveFieldRunner.Stats): LiveFieldRunner.Interface => ({
    async run(options) {
        options.onProgress({ ...stats, scanned: 10, entries: 2 });
        options.onProgress(stats);
        return stats;
    }
});

const report = {} as ChangeReport.Interface;
const client = new MockDynamoDbClient();
const target: LiveFieldRunner.Target = {
    client,
    tableName: "acme-prod-ddb",
    segments: 4
};

describe("runTable", () => {
    it("drives the spinner with live counters and returns the stats", async () => {
        const ui = new StubUI();
        const result = await runTable({
            table: "ddb",
            tableName: "acme-prod-ddb",
            region: "eu-central-1",
            runner: fakeRunner(STATS),
            target,
            mode: "dry-run",
            report,
            ui
        });
        expect(result).toEqual({
            table: "ddb",
            tableName: "acme-prod-ddb",
            region: "eu-central-1",
            stats: STATS
        });
        expect(ui.spinnerMessages[0]).toBe("Scanning DynamoDB…");
        expect(ui.spinnerMessages).toContain("Scanning DynamoDB… 10 rows / 2 entries");
        expect(ui.spinnerMessages.at(-1)).toBe("DynamoDB scanned: 148 203 rows / 31 440 entries");
    });

    it("labels the OpenSearch table", async () => {
        const ui = new StubUI();
        await runTable({
            table: "os",
            tableName: "t",
            region: "r",
            runner: fakeRunner(STATS),
            target: { client, tableName: "t", segments: 1 },
            mode: "live",
            report,
            ui
        });
        expect(ui.spinnerMessages[0]).toBe("Scanning OpenSearch…");
    });
});

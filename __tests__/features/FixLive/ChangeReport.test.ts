import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChangeReport } from "~/features/FixLive/index.js";
import { createFixLiveContainer } from "./fixLiveContainer.ts";

describe("ChangeReport", () => {
    let originalCwd: string;
    let workDir: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        workDir = await realpath(await mkdtemp(join(tmpdir(), "fix-live-report-")));
        process.chdir(workDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
    });

    it("appends one JSON line per event under .transfer/<runId>/fix-live-report.jsonl", async () => {
        const report = createFixLiveContainer({ runId: "run-1" }).resolve(ChangeReport);

        report.change({
            table: "ddb",
            pk: "T#root#CMS#CME#abc",
            sk: "L",
            reason: "missing-live",
            before: undefined,
            after: { version: 2 },
            result: "dry-run"
        });
        report.skip({
            table: "ddb",
            pk: "T#root#CMS#CME#def",
            sk: "REV#0007",
            reason: "revision-version-mismatch",
            detail: "P.version=7 REV#0007.version=6"
        });

        expect(report.path).toBe(join(workDir, ".transfer", "run-1", "fix-live-report.jsonl"));
        const lines = (await readFile(report.path, "utf-8")).trim().split("\n");
        expect(JSON.parse(lines[0]!)).toEqual({
            kind: "change",
            table: "ddb",
            pk: "T#root#CMS#CME#abc",
            sk: "L",
            reason: "missing-live",
            before: null,
            after: { version: 2 },
            result: "dry-run"
        });
        expect(JSON.parse(lines[1]!)).toEqual({
            kind: "skip",
            table: "ddb",
            pk: "T#root#CMS#CME#def",
            sk: "REV#0007",
            reason: "revision-version-mismatch",
            detail: "P.version=7 REV#0007.version=6"
        });
    });
});

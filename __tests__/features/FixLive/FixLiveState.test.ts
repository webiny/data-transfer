import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FixLiveState } from "~/features/FixLive/index.js";
import { createFixLiveContainer } from "./fixLiveContainer.ts";

const KEY = { project: "acme", system: "target" as const };

describe("FixLiveState", () => {
    let originalCwd: string;
    let workDir: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        workDir = await realpath(await mkdtemp(join(tmpdir(), "fix-live-state-")));
        process.chdir(workDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
    });

    it("resolves the path under .transfer/state/fix-live", () => {
        const state = createFixLiveContainer().resolve(FixLiveState);
        expect(state.pathFor(KEY)).toBe(
            join(workDir, ".transfer", "state", "fix-live", "acme__target.json")
        );
    });

    it("read returns null when no state exists", () => {
        expect(createFixLiveContainer().resolve(FixLiveState).read(KEY)).toBeNull();
    });

    it("recordDryRun writes lastDryRun; recordLiveRun adds lastLiveRun and keeps lastDryRun", async () => {
        const state = createFixLiveContainer().resolve(FixLiveState);
        const dry = {
            runId: "1",
            at: "2026-09-04T09:12:33.000Z",
            changes: 2118,
            skips: 4
        };
        const live = { ...dry, runId: "2", written: 2110, conditionFailed: 8 };

        state.recordDryRun(KEY, dry);
        expect(state.read(KEY)).toEqual({ lastDryRun: dry });

        state.recordLiveRun(KEY, live);
        expect(state.read(KEY)).toEqual({ lastDryRun: dry, lastLiveRun: live });
        expect(JSON.parse(await readFile(state.pathFor(KEY), "utf-8"))).toEqual({
            lastDryRun: dry,
            lastLiveRun: live
        });
    });
});

import { describe, it, expect } from "vitest";
import { LiveFieldReconciler } from "~/features/FixLive/LiveFieldReconciler.js";
import type { LiveFieldReconciler as Reconciler } from "~/features/FixLive/abstractions/LiveFieldReconciler.js";

const PK = "T#root#CMS#CME#abc";

function rec(sk: string, data: Record<string, unknown>, md = `md-${sk}`): Reconciler.Record {
    return { PK, SK: sk, _md: md, data };
}

function group(table: Reconciler.Table, ...records: Reconciler.Record[]): Reconciler.Group {
    return { pk: PK, table, records: new Map(records.map(r => [r.SK, r])) };
}

function decide(table: Reconciler.Table, ...records: Reconciler.Record[]): Reconciler.Decision {
    return new LiveFieldReconciler().decide(group(table, ...records));
}

const skipReasons = (d: Reconciler.Decision) => d.skips.map(s => s.reason);
const changeSummary = (d: Reconciler.Decision) => d.changes.map(c => `${c.sk}:${c.reason}`).sort();

describe("LiveFieldReconciler.decide — skips", () => {
    it("no-latest-record when L is absent", () => {
        const d = decide("ddb", rec("P", { version: 1, status: "published" }));
        expect(skipReasons(d)).toEqual(["no-latest-record"]);
        expect(d.changes).toEqual([]);
    });

    it("latest-status-contradicts-unpublished when P is absent but L says published", () => {
        const d = decide("ddb", rec("L", { version: 1, status: "published" }));
        expect(skipReasons(d)).toEqual(["latest-status-contradicts-unpublished"]);
    });

    it.each([["2"], [0], [-1], [1.5], [null], [undefined]])(
        "invalid-version when P.version is %s",
        version => {
            const d = decide(
                "ddb",
                rec("L", { version: 3, status: "draft" }),
                rec("P", { version, status: "published" })
            );
            expect(skipReasons(d)).toEqual(["invalid-version"]);
        }
    );

    it("latest-status-contradicts-published when L is published but on a different version", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 3, status: "published" }),
            rec("P", { version: 2, status: "published" }),
            rec("REV#0002", { version: 2 })
        );
        expect(skipReasons(d)).toEqual(["latest-status-contradicts-published"]);
    });

    it("latest-status-contradicts-published when L has P's version but is not published", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 2, status: "draft" }),
            rec("P", { version: 2, status: "published" }),
            rec("REV#0002", { version: 2 })
        );
        expect(skipReasons(d)).toEqual(["latest-status-contradicts-published"]);
    });

    it("revision-record-missing on ddb when REV#<padded> is absent", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 3, status: "draft" }),
            rec("P", { version: 2, status: "published" })
        );
        expect(d.skips).toEqual([
            { pk: PK, sk: "REV#0002", reason: "revision-record-missing", detail: "P.version=2" }
        ]);
    });

    it("revision-version-mismatch on ddb when REV# carries another version", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 7, status: "published" }),
            rec("P", { version: 7, status: "published" }),
            rec("REV#0007", { version: 6 })
        );
        expect(skipReasons(d)).toEqual(["revision-version-mismatch"]);
        expect(d.skips[0]!.detail).toBe("P.version=7 REV#0007.version=6");
    });

    it("a skip aborts the whole group — no changes alongside a skip", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 3, status: "draft", live: null }),
            rec("P", { version: 2, status: "published", live: {} })
        );
        expect(d.skips).toHaveLength(1);
        expect(d.changes).toEqual([]);
    });
});

describe("LiveFieldReconciler.decide — changes", () => {
    it("missing-live on L, P and the published REV# when live is absent or null", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 3, status: "draft" }),
            rec("P", { version: 2, status: "published", live: null }),
            rec("REV#0002", { version: 2, status: "published" }),
            rec("REV#0003", { version: 3, status: "draft" })
        );
        expect(changeSummary(d)).toEqual([
            "L:missing-live",
            "P:missing-live",
            "REV#0002:missing-live"
        ]);
        for (const change of d.changes) {
            expect(change.after).toEqual({ version: 2 });
            expect(change.expectedMd).toBe(`md-${change.sk}`);
        }
    });

    it("empty-live when live is {} or has a non-integer version", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 3, status: "draft", live: {} }),
            rec("P", { version: 2, status: "published", live: { version: "2" } }),
            rec("REV#0002", { version: 2, live: { version: 2 } })
        );
        expect(changeSummary(d)).toEqual(["L:empty-live", "P:empty-live"]);
        expect(d.changes.find(c => c.sk === "L")!.before).toEqual({});
    });

    it("wrong-version when live.version differs from P.version", () => {
        const d = decide(
            "os",
            rec("L", { version: 3, status: "draft", live: { version: 1 } }),
            rec("P", { version: 2, status: "published", live: { version: 2 } })
        );
        expect(changeSummary(d)).toEqual(["L:wrong-version"]);
    });

    it("stale-live on L only when P is absent and L carries any live value", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 2, status: "unpublished", live: { version: 1 } }),
            rec("REV#0001", { version: 1, live: { version: 1 } }),
            rec("REV#0002", { version: 2, live: { version: 1 } })
        );
        expect(changeSummary(d)).toEqual(["L:stale-live"]);
        expect(d.changes[0]!.after).toBeNull();
    });

    it("stale-live also normalises {} to null when unpublished", () => {
        const d = decide("ddb", rec("L", { version: 1, status: "draft", live: {} }));
        expect(changeSummary(d)).toEqual(["L:stale-live"]);
    });

    it("no change when unpublished and live is null or absent", () => {
        expect(
            decide("ddb", rec("L", { version: 1, status: "draft", live: null })).changes
        ).toEqual([]);
        expect(decide("ddb", rec("L", { version: 1, status: "draft" })).changes).toEqual([]);
    });

    it("clean group produces neither changes nor skips", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 2, status: "published", live: { version: 2 } }),
            rec("P", { version: 2, status: "published", live: { version: 2 } }),
            rec("REV#0002", { version: 2, live: { version: 2 } }),
            rec("REV#0001", { version: 1, live: { version: 1 } })
        );
        expect(d).toEqual({ changes: [], skips: [] });
    });

    it("os table skips the REV# checks and never touches REV# records", () => {
        const d = decide(
            "os",
            rec("L", { version: 3, status: "draft" }),
            rec("P", { version: 2, status: "published" })
        );
        expect(changeSummary(d)).toEqual(["L:missing-live", "P:missing-live"]);
        expect(d.skips).toEqual([]);
    });

    it("other REV# records never appear in changes", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 3, status: "draft", live: { version: 2 } }),
            rec("P", { version: 2, status: "published", live: { version: 2 } }),
            rec("REV#0002", { version: 2, live: { version: 2 } }),
            rec("REV#0001", { version: 1, live: {} }),
            rec("REV#0003", { version: 3 })
        );
        expect(d.changes).toEqual([]);
    });

    it("single-revision published entry reconciles L, P and REV#0001", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 1, status: "published" }),
            rec("P", { version: 1, status: "published" }),
            rec("REV#0001", { version: 1, status: "published" })
        );
        expect(changeSummary(d)).toEqual([
            "L:missing-live",
            "P:missing-live",
            "REV#0001:missing-live"
        ]);
    });

    it("pads version >= 10000 as REV#10000 (no truncation)", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 10000, status: "published" }),
            rec("P", { version: 10000, status: "published" }),
            rec("REV#10000", { version: 10000 })
        );
        expect(d.skips).toEqual([]);
        expect(d.changes.map(c => c.sk).sort()).toEqual(["L", "P", "REV#10000"]);
    });
});

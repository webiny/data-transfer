import { describe, it, expect } from "vitest";
import { DdbLiveFieldRunner } from "~/features/FixLive/index.js";
import type { LiveFieldRunner } from "~/features/FixLive/abstractions/LiveFieldRunner.js";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";
import { createFixLiveContainer } from "./fixLiveContainer.ts";
import { MockChangeReport } from "./MockChangeReport.ts";

const TABLE = "v6-main";

function entry(id: string, sk: string, data: Record<string, unknown>, md = "md-1") {
    return {
        PK: `T#root#CMS#CME#${id}`,
        SK: sk,
        TYPE: sk === "P" ? "cms.entry.p" : sk === "L" ? "cms.entry.l" : "cms.entry",
        _et: "CmsEntries",
        _ct: "2026-01-01T00:00:00.000Z",
        _md: md,
        data: { modelId: "blogPost", entryId: id, ...data }
    };
}

function seed() {
    return [
        entry("a", "L", { version: 3, status: "draft" }),
        entry("a", "P", { version: 2, status: "published" }),
        entry("a", "REV#0002", { version: 2, status: "published" }),
        entry("a", "REV#0003", { version: 3, status: "draft" }),
        entry("b", "L", { version: 1, status: "unpublished", live: { version: 1 } }),
        entry("b", "REV#0001", { version: 1, live: { version: 1 } }),
        entry("c", "L", { version: 1, status: "published" }),
        entry("c", "P", { version: 1, status: "published" }),
        entry("f", "L", { modelId: "fmFile", version: 1, status: "draft" }),
        {
            PK: "T#root#PB#P#p1",
            SK: "L",
            TYPE: "pb.page.l",
            _et: "Pb",
            _ct: "x",
            _md: "x",
            data: {}
        }
    ];
}

function run(client: MockDynamoDbClient, mode: LiveFieldRunner.Mode, segments = 2) {
    const runner = createFixLiveContainer().resolve(DdbLiveFieldRunner);
    const report = new MockChangeReport();
    const progress: number[] = [];
    return runner
        .run({
            mode,
            target: {
                client,
                tableName: TABLE,
                segments,
                concurrency: 2,
                writeConcurrency: 2
            },
            report,
            onProgress: stats => progress.push(stats.scanned)
        })
        .then(stats => ({ stats, report, progress }));
}

describe("DdbLiveFieldRunner", () => {
    it("dry run: counts, reports, writes nothing", async () => {
        const client = new MockDynamoDbClient({ [TABLE]: seed() });
        const { stats, report, progress } = await run(client, "dry-run");

        expect(stats.scanned).toBe(5);
        expect(stats.entries).toBe(3);
        expect(stats.changes).toMatchObject({ "missing-live": 3, "stale-live": 1 });
        expect(stats.skips).toMatchObject({ "revision-record-missing": 1 });
        expect(stats.written).toBe(0);
        expect(client.updateCalls).toEqual([]);
        expect(report.changes).toHaveLength(4);
        expect(report.changes.every(c => c.result === "dry-run" && c.table === "ddb")).toBe(true);
        expect(report.skips).toEqual([
            {
                table: "ddb",
                pk: "T#root#CMS#CME#c",
                sk: "REV#0001",
                reason: "revision-record-missing",
                detail: "P.version=1"
            }
        ]);
        expect(progress.length).toBeGreaterThan(0);
    });

    it("live run: conditional updates on data.live only", async () => {
        const client = new MockDynamoDbClient({ [TABLE]: seed() });
        const { stats, report } = await run(client, "live");

        expect(stats.written).toBe(4);
        expect(stats.conditionFailed).toBe(0);
        expect(client.updateCalls).toHaveLength(4);
        for (const call of client.updateCalls) {
            expect(call.request.path).toEqual(["data", "live"]);
            expect(call.request.condition).toEqual({ attribute: "_md", equals: "md-1" });
        }
        const rows = client.getRecordsForTable(TABLE);
        const data = (id: string, sk: string) =>
            rows.find(r => r.PK === `T#root#CMS#CME#${id}` && r.SK === sk)!.data as Record<
                string,
                unknown
            >;
        expect(data("a", "L").live).toEqual({ version: 2 });
        expect(data("a", "P").live).toEqual({ version: 2 });
        expect(data("a", "REV#0002").live).toEqual({ version: 2 });
        expect(data("a", "REV#0003").live).toBeUndefined();
        expect(data("b", "L").live).toBeNull();
        expect(report.changes.every(c => c.result === "written")).toBe(true);
    });

    it("live run: a record changed since read is reported as changed-during-run", async () => {
        const rows = seed();
        const client = new MockDynamoDbClient({ [TABLE]: rows });
        const original = client.updateAttribute.bind(client);
        client.updateAttribute = async (table, request) => {
            if (request.key.PK === "T#root#CMS#CME#a" && request.key.SK === "L") {
                rows.find(r => r.PK === request.key.PK && r.SK === "L")!._md = "md-2";
            }
            return original(table, request);
        };

        const { stats, report } = await run(client, "live");

        expect(stats.written).toBe(3);
        expect(stats.conditionFailed).toBe(1);
        expect(stats.skips["changed-during-run"]).toBe(1);
        expect(report.changes.find(c => c.sk === "L" && c.pk.endsWith("#a"))!.result).toBe(
            "condition-failed"
        );
        expect(report.skips).toContainEqual({
            table: "ddb",
            pk: "T#root#CMS#CME#a",
            sk: "L",
            reason: "changed-during-run",
            detail: undefined
        });
    });
});

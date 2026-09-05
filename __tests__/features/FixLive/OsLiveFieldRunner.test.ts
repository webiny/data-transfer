import { describe, it, expect } from "vitest";
import { CompressionHandler } from "@webiny/utils/exports/api.js";
import { OsLiveFieldRunner } from "~/features/FixLive/index.js";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";
import { createFixLiveContainer } from "./fixLiveContainer.ts";
import { MockChangeReport } from "./MockChangeReport.ts";

const TABLE = "v6-os";
const PK = "T#root#L#en-US#CMS#CME#a";
const INDEX = "root-headless-cms-en-us-blogpost";

describe("OsLiveFieldRunner", () => {
    it("decompresses, decides, and rewrites only live inside the blob", async () => {
        const container = createFixLiveContainer();
        const compression = container.resolve(CompressionHandler);
        const latestInner = {
            modelId: "blogPost",
            version: 3,
            status: "draft",
            live: {},
            values: { a: "" }
        };
        const publishedInner = {
            modelId: "blogPost",
            version: 2,
            status: "published",
            live: { version: 2 }
        };
        const client = new MockDynamoDbClient({
            [TABLE]: [
                {
                    PK,
                    SK: "L",
                    index: INDEX,
                    data: await compression.compress(latestInner),
                    _md: "md-1"
                },
                {
                    PK,
                    SK: "P",
                    index: INDEX,
                    data: await compression.compress(publishedInner),
                    _md: "md-1"
                },
                {
                    PK: "T#root#L#en-US#CMS#CME#file",
                    SK: "L",
                    index: "root-headless-cms-en-us-fmfile",
                    data: await compression.compress({
                        modelId: "fmFile",
                        version: 1,
                        status: "draft"
                    }),
                    _md: "md-1"
                },
                {
                    PK: "T#root#L#en-US#CMS#CME#corrupt",
                    SK: "L",
                    index: INDEX,
                    data: { compression: "gzip", value: "not-gzip" },
                    _md: "md-1"
                }
            ]
        });
        const report = new MockChangeReport();

        const stats = await container.resolve(OsLiveFieldRunner).run({
            mode: "live",
            target: { client, tableName: TABLE, segments: 1 },
            report,
            onProgress: () => {}
        });

        expect(stats.scanned).toBe(3);
        expect(stats.entries).toBe(2);
        expect(stats.changes["empty-live"]).toBe(1);
        expect(stats.skips["decompress-failed"]).toBe(1);
        expect(stats.written).toBe(1);

        const call = client.updateCalls[0]!;
        expect(call.request.key).toEqual({ PK, SK: "L" });
        expect(call.request.path).toEqual(["data"]);
        expect(call.request.condition).toEqual({ attribute: "_md", equals: "md-1" });
        const rewritten = await compression.decompress<Record<string, unknown>>(call.request.value);
        expect(rewritten).toEqual({ ...latestInner, live: { version: 2 } });
        expect(report.changes[0]).toMatchObject({
            table: "os",
            sk: "L",
            reason: "empty-live",
            before: {}
        });
    });
});

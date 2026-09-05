import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { CompressionHandler } from "@webiny/utils/exports/api.js";
import { DynamoDbClientImpl } from "~/services/DynamoDbClient/DynamoDbClient.js";
import { OsLiveFieldRunner } from "~/features/FixLive/index.js";
import type { LiveFieldRunner } from "~/features/FixLive/abstractions/LiveFieldRunner.js";
import { startDynalite, waitForTableActive, type DynaliteInstance } from "./dynalite.ts";
import { NoopLogger } from "../helpers/NoopLogger.ts";
import { createFixLiveContainer } from "../features/FixLive/fixLiveContainer.ts";
import { MockChangeReport } from "../features/FixLive/MockChangeReport.ts";

const FAKE_CREDS = { accessKeyId: "test", secretAccessKey: "test" };
const TABLE = "fix-live-os";
const PK = "T#root#L#en-US#CMS#CME#a";
const INDEX = "root-headless-cms-en-us-blogpost";
const MD = "2026-01-01T00:00:00.000Z";

interface OsRow {
    PK: string;
    SK: string;
    index: string;
    data: unknown;
    _ct: string;
    _et: string;
    _md: string;
}

const LATEST_INNER = {
    modelId: "blogPost",
    version: 3,
    status: "draft",
    live: {},
    values: { s: "" }
};
const PUBLISHED_INNER = {
    modelId: "blogPost",
    version: 2,
    status: "published",
    live: { version: 2 }
};

describe("OsLiveFieldRunner against dynalite", () => {
    let instance: DynaliteInstance;
    let doc: DynamoDBDocument;
    let client: DynamoDbClientImpl;
    const container = createFixLiveContainer();
    const compression = container.resolve(CompressionHandler);

    beforeAll(async () => {
        instance = await startDynalite();
        doc = DynamoDBDocument.from(
            new DynamoDBClient({
                endpoint: instance.endpoint,
                region: "us-east-1",
                credentials: FAKE_CREDS
            })
        );
        await doc.send(
            new CreateTableCommand({
                TableName: TABLE,
                BillingMode: "PAY_PER_REQUEST",
                AttributeDefinitions: [
                    { AttributeName: "PK", AttributeType: "S" },
                    { AttributeName: "SK", AttributeType: "S" }
                ],
                KeySchema: [
                    { AttributeName: "PK", KeyType: "HASH" },
                    { AttributeName: "SK", KeyType: "RANGE" }
                ]
            })
        );
        await waitForTableActive(doc, TABLE);
        const rows: OsRow[] = [
            {
                PK,
                SK: "L",
                index: INDEX,
                data: await compression.compress(LATEST_INNER),
                _ct: MD,
                _et: "CmsEntriesElasticsearch",
                _md: MD
            },
            {
                PK,
                SK: "P",
                index: INDEX,
                data: await compression.compress(PUBLISHED_INNER),
                _ct: MD,
                _et: "CmsEntriesElasticsearch",
                _md: MD
            }
        ];
        for (const item of rows) {
            await doc.put({ TableName: TABLE, Item: item });
        }
        client = new DynamoDbClientImpl(
            {
                region: "us-east-1",
                credentials: FAKE_CREDS,
                endpoint: instance.endpoint
            },
            new NoopLogger()
        );
    });

    afterAll(async () => {
        await instance.stop();
    });

    function run(mode: LiveFieldRunner.Mode) {
        const report = new MockChangeReport();
        return container
            .resolve(OsLiveFieldRunner)
            .run({
                mode,
                target: { client, tableName: TABLE, segments: 1 },
                report,
                onProgress: () => {}
            })
            .then(stats => ({ stats, report }));
    }

    async function readRows(): Promise<OsRow[]> {
        const response = await doc.send(new ScanCommand({ TableName: TABLE }));
        return (response.Items ?? []) as OsRow[];
    }

    it("dry run reports empty-live on L and changes nothing", async () => {
        const before = await readRows();
        const { stats, report } = await run("dry-run");

        expect(stats.entries).toBe(1);
        expect(stats.changes["empty-live"]).toBe(1);
        expect(report.changes).toEqual([
            expect.objectContaining({
                table: "os",
                sk: "L",
                reason: "empty-live",
                before: {},
                after: { version: 2 },
                result: "dry-run"
            })
        ]);
        expect(await readRows()).toEqual(before);
    });

    it("live run rewrites the L blob with only live changed and leaves root attributes alone", async () => {
        const { stats } = await run("live");

        expect(stats.written).toBe(1);
        const rows = await readRows();
        const latest = rows.find(r => r.SK === "L")!;
        const decompressed = await compression.decompress<Record<string, unknown>>(latest.data);
        expect(decompressed).toEqual({ ...LATEST_INNER, live: { version: 2 } });
        expect(latest._md).toBe(MD);
        expect(latest.index).toBe(INDEX);
        expect(rows.find(r => r.SK === "P")!.data).toEqual(
            await compression.compress(PUBLISHED_INNER)
        );

        const again = await run("dry-run");
        expect(again.report.changes).toEqual([]);
    });
});

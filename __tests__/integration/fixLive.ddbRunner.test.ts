import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDbClientImpl } from "~/services/DynamoDbClient/DynamoDbClient.js";
import type { SourceDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { DdbLiveFieldRunner } from "~/features/FixLive/index.js";
import type { LiveFieldRunner } from "~/features/FixLive/abstractions/LiveFieldRunner.js";
import { startDynalite, waitForTableActive, type DynaliteInstance } from "./dynalite.ts";
import { NoopLogger } from "../helpers/NoopLogger.ts";
import { createFixLiveContainer } from "../features/FixLive/fixLiveContainer.ts";
import { MockChangeReport } from "../features/FixLive/MockChangeReport.ts";

const FAKE_CREDS = { accessKeyId: "test", secretAccessKey: "test" };
const TABLE = "fix-live-ddb";
const PK_A = "T#root#CMS#CME#a";
const PK_B = "T#root#CMS#CME#b";

interface SeedRow {
    PK: string;
    SK: string;
    TYPE: string;
    _et: string;
    _ct: string;
    _md: string;
    data: Record<string, unknown>;
}

function row(pk: string, sk: string, data: Record<string, unknown>): SeedRow {
    return {
        PK: pk,
        SK: sk,
        TYPE: sk === "P" ? "cms.entry.p" : sk === "L" ? "cms.entry.l" : "cms.entry",
        _et: "CmsEntries",
        _ct: "2026-01-01T00:00:00.000Z",
        _md: "2026-01-01T00:00:00.000Z",
        data: { modelId: "blogPost", values: { emptyString: "" }, ...data }
    };
}

const SEED: SeedRow[] = [
    row(PK_A, "L", { version: 3, status: "draft" }),
    row(PK_A, "P", { version: 2, status: "published" }),
    row(PK_A, "REV#0002", { version: 2, status: "published" }),
    row(PK_A, "REV#0003", { version: 3, status: "draft" }),
    row(PK_B, "L", { version: 1, status: "unpublished", live: { version: 1 } }),
    row(PK_B, "REV#0001", { version: 1, live: { version: 1 } })
];

async function createTable(doc: DynamoDBDocument, tableName: string): Promise<void> {
    await doc.send(
        new CreateTableCommand({
            TableName: tableName,
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
    await waitForTableActive(doc, tableName);
}

async function scanAll(doc: DynamoDBDocument, tableName: string): Promise<SeedRow[]> {
    const response = await doc.send(new ScanCommand({ TableName: tableName }));
    return (response.Items ?? []) as SeedRow[];
}

class MdBumpingClient implements SourceDynamoDbClient.Interface {
    public constructor(
        private readonly inner: SourceDynamoDbClient.Interface,
        private readonly doc: DynamoDBDocument,
        private readonly targetSk: string
    ) {}

    public scan<T extends SourceDynamoDbClient.Record>(
        tableName: string,
        options?: SourceDynamoDbClient.Scan
    ) {
        return this.inner.scan<T>(tableName, options);
    }
    public query<T extends SourceDynamoDbClient.Record>(
        t: string,
        pk: string,
        sk?: string,
        o?: SourceDynamoDbClient.Query
    ) {
        return this.inner.query<T>(t, pk, sk, o);
    }
    public queryAll<T extends SourceDynamoDbClient.Record>(
        t: string,
        pk: string,
        sk?: string,
        o?: SourceDynamoDbClient.Query
    ) {
        return this.inner.queryAll<T>(t, pk, sk, o);
    }
    public get<T extends SourceDynamoDbClient.Record>(t: string, pk: string, sk: string) {
        return this.inner.get<T>(t, pk, sk);
    }
    public batchPut<T extends SourceDynamoDbClient.Record>(t: string, records: T[]) {
        return this.inner.batchPut(t, records);
    }
    public async updateAttribute(tableName: string, request: SourceDynamoDbClient.UpdateRequest) {
        if (request.key.SK === this.targetSk) {
            await this.doc.update({
                TableName: tableName,
                Key: request.key,
                UpdateExpression: "SET #md = :md",
                ExpressionAttributeNames: { "#md": "_md" },
                ExpressionAttributeValues: { ":md": "2026-09-04T00:00:00.000Z" }
            });
        }
        return this.inner.updateAttribute(tableName, request);
    }
}

describe("DdbLiveFieldRunner against dynalite", () => {
    let instance: DynaliteInstance;
    let doc: DynamoDBDocument;
    let client: DynamoDbClientImpl;

    beforeAll(async () => {
        instance = await startDynalite();
        doc = DynamoDBDocument.from(
            new DynamoDBClient({
                endpoint: instance.endpoint,
                region: "us-east-1",
                credentials: FAKE_CREDS
            })
        );
        await createTable(doc, TABLE);
        for (const item of SEED) {
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

    function run(mode: LiveFieldRunner.Mode, useClient: SourceDynamoDbClient.Interface = client) {
        const report = new MockChangeReport();
        return createFixLiveContainer()
            .resolve(DdbLiveFieldRunner)
            .run({
                mode,
                target: { client: useClient, tableName: TABLE, segments: 2 },
                report,
                onProgress: () => {}
            })
            .then(stats => ({ stats, report }));
    }

    it("dry run reports 4 changes and leaves the table unchanged", async () => {
        const before = await scanAll(doc, TABLE);
        const { stats, report } = await run("dry-run");

        expect(stats.scanned).toBe(2);
        expect(stats.entries).toBe(2);
        expect(stats.changes["missing-live"]).toBe(3);
        expect(stats.changes["stale-live"]).toBe(1);
        expect(report.changes.map(c => c.result)).toEqual([
            "dry-run",
            "dry-run",
            "dry-run",
            "dry-run"
        ]);
        expect(await scanAll(doc, TABLE)).toEqual(before);
    });

    it("live run writes data.live only and keeps an empty string byte-identical", async () => {
        const { stats } = await run("live");

        expect(stats.written).toBe(4);
        expect(stats.conditionFailed).toBe(0);
        const rows = await scanAll(doc, TABLE);
        const data = (pk: string, sk: string) => rows.find(r => r.PK === pk && r.SK === sk)!.data;
        expect(data(PK_A, "L").live).toEqual({ version: 2 });
        expect(data(PK_A, "P").live).toEqual({ version: 2 });
        expect(data(PK_A, "REV#0002").live).toEqual({ version: 2 });
        expect(data(PK_A, "REV#0003").live).toBeUndefined();
        expect(data(PK_B, "L").live).toBeNull();
        expect((data(PK_A, "L").values as Record<string, unknown>).emptyString).toBe("");
        expect(rows.every(r => r._md === "2026-01-01T00:00:00.000Z")).toBe(true);

        const again = await run("dry-run");
        expect(again.report.changes).toEqual([]);
    });

    it("a record whose _md changed between read and write is reported as changed-during-run", async () => {
        await doc.update({
            TableName: TABLE,
            Key: { PK: PK_A, SK: "P" },
            UpdateExpression: "SET #d.#l = :empty",
            ExpressionAttributeNames: { "#d": "data", "#l": "live" },
            ExpressionAttributeValues: { ":empty": {} }
        });

        const { stats, report } = await run("live", new MdBumpingClient(client, doc, "P"));

        expect(stats.changes["empty-live"]).toBe(1);
        expect(stats.written).toBe(0);
        expect(stats.conditionFailed).toBe(1);
        expect(report.skips).toContainEqual({
            table: "ddb",
            pk: PK_A,
            sk: "P",
            reason: "changed-during-run",
            detail: undefined
        });
    });
});

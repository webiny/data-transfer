import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { PipelineRunner } from "~/features/PipelineRunner/index.js";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.js";
import { DdbScanner } from "~/features/DdbScanner/index.js";
import { DdbProcessor } from "~/features/DdbProcessor/index.js";
import { createFilter } from "~/domain/pipeline/index.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";
import { startDynalite, type DynaliteInstance } from "./dynalite.ts";
import { createDdbIntegrationContainer } from "./integrationContainer.ts";

const FAKE_CREDS = { accessKeyId: "test", secretAccessKey: "test" };

function makeRecord(pk: string, sk: string, type: string): BaseRecord {
    return {
        PK: pk,
        SK: sk,
        _et: "Test",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: type
    };
}

async function createDdbTable(doc: DynamoDBDocument, tableName: string): Promise<void> {
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
}

async function readJsonlGz(path: string): Promise<unknown[]> {
    const raw = await readFile(path);
    const decoded = gunzipSync(raw).toString("utf-8");
    return decoded
        .split("\n")
        .filter(line => line.length > 0)
        .map(line => JSON.parse(line));
}

describe("snapshot — end-to-end against dynalite", () => {
    let instance: DynaliteInstance;
    let doc: DynamoDBDocument;
    let workDir: string;
    let originalCwd: string;

    beforeAll(async () => {
        instance = await startDynalite();
        const client = new DynamoDBClient({
            endpoint: instance.endpoint,
            region: "us-east-1",
            credentials: FAKE_CREDS
        });
        doc = DynamoDBDocument.from(client);
    });

    afterAll(async () => {
        await instance.stop();
    });

    beforeEach(async () => {
        originalCwd = process.cwd();
        workDir = await mkdtemp(join(tmpdir(), "snapshot-integration-"));
        process.chdir(workDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
    });

    it("writes per-record source + post-transform + commands when enabled", async () => {
        const sourceTable = "snap-src";
        const targetTable = "snap-tgt";
        await createDdbTable(doc, sourceTable);
        await createDdbTable(doc, targetTable);

        // 3 "team" records + 2 "group" records. Pipeline filters on type=team.
        const records = [
            makeRecord("T#root", "team-1", "team"),
            makeRecord("T#root", "team-2", "team"),
            makeRecord("T#root", "team-3", "team"),
            makeRecord("T#root", "group-1", "group"),
            makeRecord("T#root", "group-2", "group")
        ];
        await doc.send(
            new BatchWriteCommand({
                RequestItems: {
                    [sourceTable]: records.map(r => ({ PutRequest: { Item: r } }))
                }
            })
        );

        const container = createDdbIntegrationContainer({
            endpoint: instance.endpoint,
            sourceTable,
            targetTable,
            segments: 1,
            snapshot: { dir: ".snap", compress: true }
        });

        const runner = container.resolve(PipelineRunner);
        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "teams",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        builder.filter(createFilter<BaseRecord>(r => r.TYPE === "team"));
        runner.register(await builder.build());

        await runner.run({ segment: 0, totalSegments: 1 });

        const snapDir = join(workDir, ".snap");
        const source = await readJsonlGz(join(snapDir, "teams/segment-0.source.jsonl.gz"));
        expect(source).toHaveLength(3);
        expect(source.map((r: any) => r.SK).sort()).toEqual(["team-1", "team-2", "team-3"]);

        const postTransform = await readJsonlGz(
            join(snapDir, "teams/segment-0.post-transform.jsonl.gz")
        );
        expect(postTransform).toHaveLength(3); // passthrough — same count

        const commands = await readJsonlGz(join(snapDir, "teams/segment-0.commands.jsonl.gz"));
        expect(commands).toHaveLength(3); // one auto-put PutRecord per matched record
        expect(commands.every((c: any) => c.key === "PUT_RECORD")).toBe(true);

        const dropped = await readJsonlGz(join(snapDir, "dropped/segment-0.jsonl.gz"));
        expect(dropped).toHaveLength(2);
        expect(dropped.map((r: any) => r.SK).sort()).toEqual(["group-1", "group-2"]);
    }, 30_000);

    it("writes nothing when snapshot is disabled (default)", async () => {
        const sourceTable = "snap-nochange-src";
        const targetTable = "snap-nochange-tgt";
        await createDdbTable(doc, sourceTable);
        await createDdbTable(doc, targetTable);

        await doc.put({
            TableName: sourceTable,
            Item: makeRecord("T#root", "r1", "any")
        });

        const container = createDdbIntegrationContainer({
            endpoint: instance.endpoint,
            sourceTable,
            targetTable,
            segments: 1
            // snapshot not set → default disabled
        });

        const runner = container.resolve(PipelineRunner);
        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "all",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        builder.filter(createFilter<BaseRecord>(() => true));
        runner.register(await builder.build());

        await runner.run({ segment: 0, totalSegments: 1 });

        // Snapshot is disabled — the snapshot subdir must not exist.
        // TransferredRecordLog + DroppedRecordLog write to .transfer/<runId>/
        // unconditionally, so .transfer/ may exist. Only assert the snapshot
        // dir itself is absent.
        let snapshotExists = false;
        try {
            await readdir(join(workDir, ".transfer", "integration-run", "snapshot"));
            snapshotExists = true;
        } catch {
            snapshotExists = false;
        }
        expect(snapshotExists).toBe(false);
    }, 30_000);
});

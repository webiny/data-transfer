import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { sdkStreamMixin } from "@smithy/util-stream";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBClient,
    CreateTableCommand as CreateDdbTableCommand
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument, BatchWriteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { startDynalite, type DynaliteInstance } from "./dynalite.ts";
import { createDdbIntegrationContainer } from "./integrationContainer.ts";

const FAKE_CREDS = { accessKeyId: "test", secretAccessKey: "test" };
const FIXTURE_PATH = fileURLToPath(new URL("../data/small-one.json", import.meta.url));

// Valid 1x1 PNG. sharp + exifreader need a parseable image to stay on
// the extractImageMetadata happy path; this is the smallest payload
// that satisfies both.
const TINY_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC",
    "base64"
);

async function loadFixture(path: string): Promise<BaseRecord[]> {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as BaseRecord[];
}

async function createDdbTable(doc: DynamoDBDocument, tableName: string): Promise<void> {
    await doc.send(
        new CreateDdbTableCommand({
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

async function seedRecords(
    doc: DynamoDBDocument,
    tableName: string,
    records: BaseRecord[]
): Promise<void> {
    const BATCH = 25;
    for (let offset = 0; offset < records.length; offset += BATCH) {
        const batch: { PutRequest: { Item: BaseRecord } }[] = [];
        const end = Math.min(offset + BATCH, records.length);
        for (let i = offset; i < end; i++) {
            batch.push({ PutRequest: { Item: records[i]! } });
        }
        await doc.send(new BatchWriteCommand({ RequestItems: { [tableName]: batch } }));
    }
}

async function scanAll(doc: DynamoDBDocument, tableName: string): Promise<BaseRecord[]> {
    const items: BaseRecord[] = [];
    let lastKey: Record<string, unknown> | undefined;
    do {
        const response = await doc.send(
            new ScanCommand({ TableName: tableName, ExclusiveStartKey: lastKey })
        );
        for (const item of response.Items ?? []) {
            items.push(item as BaseRecord);
        }
        lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    return items;
}

describe("preset — v5-to-v6-ddb end-to-end against real fixture", () => {
    let instance: DynaliteInstance;
    let doc: DynamoDBDocument;
    let fixture: BaseRecord[];

    // aws-sdk-client-mock patches the S3Client class globally. Restore in
    // afterAll so unrelated suites aren't affected if vitest reuses the
    // module graph across files.
    const s3Mock = mockClient(S3Client);

    beforeAll(async () => {
        instance = await startDynalite();
        const client = new DynamoDBClient({
            endpoint: instance.endpoint,
            region: "us-east-1",
            credentials: FAKE_CREDS
        });
        doc = DynamoDBDocument.from(client);
        fixture = await loadFixture(FIXTURE_PATH);

        // GetObject: return a fresh stream per call — the SDK reads the
        // Body exactly once via transformToByteArray, so a shared stream
        // would ECONNRESET on the second caller.
        s3Mock.on(GetObjectCommand).callsFake(() => {
            return { Body: sdkStreamMixin(Readable.from(TINY_PNG)) };
        });
        // CopyObject: silent no-op success.
        s3Mock.on(CopyObjectCommand).resolves({});
    });

    afterAll(async () => {
        s3Mock.restore();
        await instance.stop();
    });

    it("loads the preset, runs it over 314 v5 records, and writes transformed output to the target", async () => {
        const source = "preset-src";
        const target = "preset-tgt";
        await createDdbTable(doc, source);
        await createDdbTable(doc, target);
        await seedRecords(doc, source, fixture);

        const container = createDdbIntegrationContainer({
            endpoint: instance.endpoint,
            sourceTable: source,
            targetTable: target,
            segments: 1,
            useRealS3Client: true
        });

        const preset = await container.resolve(PresetLoader).load("v5-to-v6-ddb");
        await preset.configure({
            runner: container.resolve(PipelineRunner),
            pipelineBuilderFactory: container.resolve(PipelineBuilderFactory),
            container
        });

        await container.resolve(PipelineRunner).run({ segment: 0, totalSegments: 1 });

        const transferred = await scanAll(doc, target);

        // Two competing effects on target count:
        //   - Records filtered out (undefined TYPE, migration.run, etc) → fewer.
        //   - createMetadata emits extra KV metadata records per fmFile → more.
        // Net: at least SOMETHING transferred; exact count is fixture-shape-
        // dependent and not load-bearing.
        expect(transferred.length).toBeGreaterThan(0);

        // Spot-check: records that went through `wrapInData` end up with
        // top-level non-reserved fields nested under `data`. True only if
        // the runner's per-record ctx is mutated by ctx.replace() —
        // regression guard for the spread-vs-reference fix in
        // PipelineRunner.runRecord.
        const wrappedModelIds = transferred
            .map(r => (r["data"] as { modelId?: string } | undefined)?.modelId)
            .filter((id): id is string => typeof id === "string");
        expect(wrappedModelIds.length).toBeGreaterThan(0);

        // createMetadata fires for fmFile records inside the fmFiles
        // pipeline: emits a KV metadata record per matched file.
        // PK shape: "KV#global:FileManager/File/<id>/Metadata"
        const fileMetadataRecords = transferred.filter(
            r => typeof r.PK === "string" && r.PK.startsWith("KV#global:FileManager/File/")
        );
        expect(fileMetadataRecords.length).toBeGreaterThan(0);

        // S3Processor drains S3Copy commands through the real S3ClientImpl.
        // aws-sdk-client-mock captures the CopyObjectCommand invocations
        // so we can assert the wire-level call count.
        expect(s3Mock.commandCalls(CopyObjectCommand).length).toBeGreaterThan(0);
    }, 30_000);
});

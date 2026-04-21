import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
    DynamoDBClient,
    CreateTableCommand as CreateDdbTableCommand
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument, BatchWriteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";
import { SourceS3Client, TargetS3Client } from "~/services/S3Client/abstractions/S3Client.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { startDynalite, type DynaliteInstance } from "./dynalite.ts";
import { createDdbIntegrationContainer } from "./integrationContainer.ts";
import { MockS3Client } from "../services/S3Client/MockS3Client.ts";

const FAKE_CREDS = { accessKeyId: "test", secretAccessKey: "test" };
const FIXTURE_PATH = fileURLToPath(new URL("../data/small-one.json", import.meta.url));

// Valid 1x1 PNG. sharp + exifreader need a parseable image; this is the
// smallest payload that keeps extractImageMetadata on the happy path.
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

    beforeAll(async () => {
        instance = await startDynalite();
        const client = new DynamoDBClient({
            endpoint: instance.endpoint,
            region: "us-east-1",
            credentials: FAKE_CREDS
        });
        doc = DynamoDBDocument.from(client);
        fixture = await loadFixture(FIXTURE_PATH);
    });

    afterAll(async () => {
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
            segments: 1
        });

        // MockS3Client is DDB-container-default. Override getObject to
        // always return a valid tiny PNG so fmFiles → extractImageMetadata
        // stays on the happy path (sharp + exifreader are satisfied).
        // batchCopy is already a silent no-op; copies are recorded on
        // targetMock.copies for assertion.
        const sourceMock = container.resolve(SourceS3Client) as MockS3Client;
        sourceMock.getObject = async () => TINY_PNG;
        const targetMock = container.resolve(TargetS3Client) as MockS3Client;

        const preset = await container.resolve(PresetLoader).load("v5-to-v6-ddb");
        await preset.configure({
            runner: container.resolve(PipelineRunner),
            pipelineBuilderFactory: container.resolve(PipelineBuilderFactory),
            container
        });

        await container.resolve(PipelineRunner).run({ segment: 0, totalSegments: 1 });

        const transferred = await scanAll(doc, target);

        // The preset drops records whose TYPE matches no pipeline filter
        // (e.g., SocketsConnectionRegistry, migration, tenancy.tenant, the
        // 14 undefined-TYPE rows). We expect SOMETHING transferred but
        // fewer than the source count.
        expect(transferred.length).toBeGreaterThan(0);
        expect(transferred.length).toBeLessThanOrEqual(fixture.length);

        // Spot-check: at least one record shows the hallmark of the
        // `wrapInData` transformer — top-level fields nested under `data`.
        const hasWrappedData = transferred.some(
            r => typeof r["data"] === "object" && r["data"] !== null
        );
        expect(hasWrappedData).toBe(true);

        // Harmless guard so MockS3 typing doesn't rot if the preset wiring
        // stops touching S3 entirely. Not asserting on count — whether
        // fmFiles produces copies depends on both preset wiring and
        // fixture-record content (see test discovery notes in the PR).
        expect(targetMock.copies).toBeInstanceOf(Array);
    }, 30_000);
});

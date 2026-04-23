import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { sdkStreamMixin } from "@smithy/util-stream";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBClient,
    CreateTableCommand as CreateDdbTableCommand
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument, BatchWriteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand, CopyObjectCommand } from "@webiny/aws-sdk/client-s3";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";
import { AfterLoadPresetHook } from "~/features/PresetLifecycle/index.ts";
import { MigrationConfig } from "~/features/MigrationConfig/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { startDynalite, type DynaliteInstance } from "./dynalite.ts";
import { createDdbIntegrationContainer } from "./integrationContainer.ts";

const FAKE_CREDS = { accessKeyId: "test", secretAccessKey: "test" };
const SOURCE_PATH = fileURLToPath(new URL("../data/small-one.json", import.meta.url));
const EXPECTED_PATH = fileURLToPath(new URL("../data/small-one.expected.json", import.meta.url));
const MODELS_DIR = fileURLToPath(new URL("../data", import.meta.url));

// Frozen clock so createMetadata's `new Date().toISOString()` produces a
// stable timestamp across runs — otherwise the golden file would churn
// every time the test runs.
const FROZEN_NOW = new Date("2026-04-21T12:00:00.000Z");

// 1x1 PNG; sharp + exifreader parse it without throwing so
// extractImageMetadata stays on the happy path.
const TINY_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC",
    "base64"
);

async function loadJson<T>(path: string): Promise<T> {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
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
    // Stable ordering for deterministic golden-file comparison.
    items.sort((a, b) => {
        const pk = (a.PK as string).localeCompare(b.PK as string);
        return pk !== 0 ? pk : (a.SK as string).localeCompare(b.SK as string);
    });
    return items;
}

describe("preset — v5-to-v6-ddb golden-file correctness", () => {
    let instance: DynaliteInstance;
    let doc: DynamoDBDocument;
    let source: BaseRecord[];

    const s3Mock = mockClient(S3Client);

    beforeAll(async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(FROZEN_NOW);

        instance = await startDynalite();
        const client = new DynamoDBClient({
            endpoint: instance.endpoint,
            region: "us-east-1",
            credentials: FAKE_CREDS
        });
        doc = DynamoDBDocument.from(client);
        source = await loadJson<BaseRecord[]>(SOURCE_PATH);

        s3Mock.on(GetObjectCommand).callsFake(() => ({
            Body: sdkStreamMixin(Readable.from(TINY_PNG))
        }));
        s3Mock.on(CopyObjectCommand).resolves({});
    });

    afterAll(async () => {
        s3Mock.restore();
        await instance.stop();
        vi.useRealTimers();
    });

    it("runs the full v5-to-v6-ddb preset over __tests__/data/small-one.json and produces the committed golden target state", async () => {
        const sourceTable = "golden-src";
        const targetTable = "golden-tgt";
        await createDdbTable(doc, sourceTable);
        await createDdbTable(doc, targetTable);
        await seedRecords(doc, sourceTable, source);

        const container = createDdbIntegrationContainer({
            endpoint: instance.endpoint,
            sourceTable,
            targetTable,
            segments: 1,
            useRealS3Client: true,
            modelsDir: MODELS_DIR
        });

        const config = container.resolve(MigrationConfig);
        const presetLoader = container.resolve(PresetLoader);
        const preset = await presetLoader.load("v5-to-v6-ddb");
        await preset.configure({
            runner: container.resolve(PipelineRunner),
            pipelineBuilderFactory: container.resolve(PipelineBuilderFactory),
            container
        });

        const afterLoadPreset = container.resolve(AfterLoadPresetHook);
        await afterLoadPreset.execute(config, preset);

        await container.resolve(PipelineRunner).run({ segment: 0, totalSegments: 1 });

        const transferred = await scanAll(doc, targetTable);

        // Golden-file mode. When UPDATE_EXPECTED=1 the test OVERWRITES
        // small-one.expected.json from the live target and passes trivially.
        // Use to regenerate after an intentional preset or transformer
        // change, then code-review the diff before committing.
        if (process.env.UPDATE_EXPECTED === "1") {
            await writeFile(EXPECTED_PATH, `${JSON.stringify(transferred, null, 2)}\n`);
            return;
        }

        const expected = await loadJson<BaseRecord[]>(EXPECTED_PATH);
        expect(transferred).toEqual(expected);
    }, 60_000);
});

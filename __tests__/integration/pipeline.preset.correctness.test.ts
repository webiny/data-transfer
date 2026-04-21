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
import { S3Client, GetObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { startDynalite, type DynaliteInstance } from "./dynalite.ts";
import { createDdbIntegrationContainer } from "./integrationContainer.ts";

const FAKE_CREDS = { accessKeyId: "test", secretAccessKey: "test" };
const SOURCE_PATH = fileURLToPath(new URL("../data/preset-sample.source.json", import.meta.url));
const EXPECTED_PATH = fileURLToPath(
    new URL("../data/preset-sample.expected.json", import.meta.url)
);

// Frozen clock so createMetadata's `new Date().toISOString()` produces a
// stable timestamp across runs — otherwise the golden file would churn
// every time the test runs.
const FROZEN_NOW = new Date("2026-04-21T12:00:00.000Z");

// Reserved top-level attributes per wrapInData; every transferred record
// should only have these keys at top level (plus `data`).
const RESERVED_ATTRIBUTES = new Set([
    "PK",
    "SK",
    "GSI_TENANT",
    "GSI1_PK",
    "GSI1_SK",
    "GSI2_PK",
    "GSI2_SK",
    "TYPE",
    "data",
    "expiresAt",
    "_ct",
    "_et",
    "_md"
]);

const V6_MODEL_IDS = new Set([
    "wbyFmFile",
    "wbyAcoFolder",
    "wbyAcoFilter",
    "wbyTask",
    "wbyTaskLog",
    "wbyRecordLock"
]);

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

describe("preset — v5-to-v6-ddb correctness against curated sample", () => {
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

    it("produces the expected target state for 4 curated v5 records", async () => {
        const sourceTable = "corr-src";
        const targetTable = "corr-tgt";
        await createDdbTable(doc, sourceTable);
        await createDdbTable(doc, targetTable);
        await seedRecords(doc, sourceTable, source);

        const container = createDdbIntegrationContainer({
            endpoint: instance.endpoint,
            sourceTable,
            targetTable,
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

        const transferred = await scanAll(doc, targetTable);

        // Golden-file mode. When UPDATE_EXPECTED=1 is set, the test
        // OVERWRITES preset-sample.expected.json from the live target
        // and passes trivially. Use this to regenerate after an
        // intentional preset or transformer change, then code-review
        // the diff before committing.
        if (process.env.UPDATE_EXPECTED === "1") {
            await writeFile(EXPECTED_PATH, `${JSON.stringify(transferred, null, 2)}\n`);
            return;
        }

        const expected = await loadJson<BaseRecord[]>(EXPECTED_PATH);
        expect(transferred).toEqual(expected);
    }, 30_000);

    describe("structural invariants", () => {
        let transferred: BaseRecord[];

        beforeAll(async () => {
            const sourceTable = "inv-src";
            const targetTable = "inv-tgt";
            await createDdbTable(doc, sourceTable);
            await createDdbTable(doc, targetTable);
            await seedRecords(doc, sourceTable, source);

            const container = createDdbIntegrationContainer({
                endpoint: instance.endpoint,
                sourceTable,
                targetTable,
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
            transferred = await scanAll(doc, targetTable);
        }, 30_000);

        it("wrapInData: every record's top-level keys are a subset of RESERVED", () => {
            for (const record of transferred) {
                for (const key of Object.keys(record)) {
                    expect(
                        RESERVED_ATTRIBUTES.has(key),
                        `${record.PK}|${record.SK} has unexpected top-level key "${key}"`
                    ).toBe(true);
                }
            }
        });

        // NOTE: the fmFiles pipeline (isFmFile filter) currently does NOT
        // include `removeAttributes` or `updateModelIds`, unlike every
        // other pipeline in the preset. So fmFile-origin records keep
        // `data.webinyVersion` and `data.modelId === "fmFile"` post-
        // transform. Might be intentional (Bruno flagged the fmFiles
        // pipeline as scheduled for rework — originally a class extending
        // the CMS pipeline), might be a gap. Invariants below scope around
        // it until the rework answers which.
        const isFmFileOrigin = (r: BaseRecord): boolean => {
            const data = r["data"] as { modelId?: string } | undefined;
            return data?.modelId === "fmFile";
        };

        it("removeAttributes: non-fmFile records drop data.webinyVersion", () => {
            for (const record of transferred) {
                if (isFmFileOrigin(record)) {
                    continue;
                }
                const data = record["data"] as Record<string, unknown> | undefined;
                if (!data) {
                    continue;
                }
                expect(
                    data["webinyVersion"],
                    `${record.PK} still has webinyVersion`
                ).toBeUndefined();
            }
        });

        it("updateModelIds: non-fmFile records have no v5-only modelId", () => {
            const v5OnlyIds = new Set([
                "fmFile",
                "acoFolder",
                "acoFilter",
                "webinyTask",
                "webinyTaskLog",
                "wby_recordLocking"
            ]);
            for (const record of transferred) {
                if (isFmFileOrigin(record)) {
                    continue;
                }
                const data = record["data"] as Record<string, unknown> | undefined;
                const modelId = data?.["modelId"];
                if (typeof modelId !== "string") {
                    continue;
                }
                expect(
                    v5OnlyIds.has(modelId),
                    `${record.PK} still has v5 modelId "${modelId}"`
                ).toBe(false);
            }
        });

        it("updateModelIds: data.modelId is either passthrough or in the v6 set", () => {
            for (const record of transferred) {
                if (isFmFileOrigin(record)) {
                    continue;
                }
                const data = record["data"] as Record<string, unknown> | undefined;
                const modelId = data?.["modelId"];
                if (typeof modelId !== "string") {
                    continue;
                }
                const mappedV6 = V6_MODEL_IDS.has(modelId);
                const passthroughCustom = !mappedV6 && modelId !== "fmFile";
                expect(mappedV6 || passthroughCustom, `${record.PK} modelId="${modelId}"`).toBe(
                    true
                );
            }
        });

        it("addGsiTenant: records from pipelines that use it carry a GSI_TENANT", () => {
            // fm.settings, fmFiles (via spread through createMetadata's output
            // KV records), cms.entry (non-file), cms.model all run addGsiTenant
            // OR are already-wrapped v5 records that don't need it. Check that
            // at least one non-fm-settings transferred record has GSI_TENANT —
            // guard against the transformer silently dropping.
            const withTenant = transferred.filter(
                r => typeof r["GSI_TENANT"] === "string" && r["GSI_TENANT"]!.length > 0
            );
            expect(withTenant.length).toBeGreaterThan(0);
        });

        it("createMetadata: each fmFile source record produces a KV metadata record", () => {
            const fmFileSources = source.filter(
                r => (r as unknown as { modelId?: string }).modelId === "fmFile"
            );
            const kvMetadataRecords = transferred.filter(
                r => typeof r.PK === "string" && r.PK.startsWith("KV#global:FileManager/File/")
            );
            expect(kvMetadataRecords.length).toBe(fmFileSources.length);
        });
    });
});

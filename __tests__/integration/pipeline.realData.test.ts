import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument, BatchWriteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { startDynalite, type DynaliteInstance } from "./dynalite.ts";
import { createDdbIntegrationContainer } from "./integrationContainer.ts";

const FAKE_CREDS = { accessKeyId: "test", secretAccessKey: "test" };
const FIXTURE_PATH = fileURLToPath(new URL("../data/small-one.json", import.meta.url));

async function loadFixture(path: string): Promise<BaseRecord[]> {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as BaseRecord[];
}

async function createDdbTable(client: DynamoDBClient, tableName: string): Promise<void> {
    await client.send(
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

function indexByPkSk(records: BaseRecord[]): Map<string, BaseRecord> {
    return new Map(records.map(r => [`${r.PK}|${r.SK}`, r]));
}

describe("pipeline — real-world data transfer against dynalite", () => {
    let instance: DynaliteInstance;
    let client: DynamoDBClient;
    let doc: DynamoDBDocument;
    let fixture: BaseRecord[];

    beforeAll(async () => {
        instance = await startDynalite();
        client = new DynamoDBClient({
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

    it("roundtrips every record in __tests__/data/small-one.json byte-exact via the pipeline", async () => {
        const source = "real-small-src";
        const target = "real-small-tgt";
        await createDdbTable(client, source);
        await createDdbTable(client, target);
        await seedRecords(doc, source, fixture);

        // Sanity check: dynalite actually stored what we seeded.
        const seeded = await scanAll(doc, source);
        expect(seeded).toHaveLength(fixture.length);

        const container = createDdbIntegrationContainer({
            endpoint: instance.endpoint,
            sourceTable: source,
            targetTable: target,
            segments: 1
        });

        const runner = container.resolve(PipelineRunner);
        runner.register(
            await container
                .resolve(PipelineBuilderFactory)
                .create({
                    name: "real-passthrough",
                    scanner: DdbScanner,
                    processors: [DdbProcessor]
                })
                .build()
        );

        await runner.run({ segment: 0, totalSegments: 1 });

        const transferred = await scanAll(doc, target);
        expect(transferred).toHaveLength(fixture.length);

        const expectedByKey = indexByPkSk(fixture);
        const missing: string[] = [];
        const diverged: string[] = [];
        for (const actual of transferred) {
            const key = `${actual.PK}|${actual.SK}`;
            const expected = expectedByKey.get(key);
            if (!expected) {
                missing.push(key);
                continue;
            }
            try {
                expect(actual).toEqual(expected);
            } catch {
                diverged.push(key);
            }
        }
        expect({ missing, diverged }).toEqual({ missing: [], diverged: [] });
    }, 30_000);
});

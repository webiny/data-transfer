import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { PipelineRunner } from "~/features/PipelineRunner/index.js";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.js";
import { DdbScanner } from "~/features/DdbScanner/index.js";
import { DdbProcessor } from "~/features/DdbProcessor/index.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";
import { startDynalite, type DynaliteInstance } from "./dynalite.ts";
import { createDdbIntegrationContainer } from "./integrationContainer.ts";

const FAKE_CREDS = { accessKeyId: "test", secretAccessKey: "test" };
const SOURCE_TABLE = "integration-source";
const TARGET_TABLE = "integration-target";

function makeRecord(
    pk: string,
    sk: string,
    type: string,
    extra: Record<string, unknown> = {}
): BaseRecord {
    return {
        PK: pk,
        SK: sk,
        _et: "Test",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: type,
        ...extra
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

describe("pipeline — end-to-end data transfer against dynalite", () => {
    let instance: DynaliteInstance;
    let doc: DynamoDBDocument;

    beforeAll(async () => {
        instance = await startDynalite();
        const client = new DynamoDBClient({
            endpoint: instance.endpoint,
            region: "us-east-1",
            credentials: FAKE_CREDS
        });
        doc = DynamoDBDocument.from(client);
        await createDdbTable(doc, SOURCE_TABLE);
        await createDdbTable(doc, TARGET_TABLE);
    });

    afterAll(async () => {
        await instance.stop();
    });

    it("scans source DDB, dispatches records through the pipeline, and writes them to the target DDB", async () => {
        const sourceRecords: BaseRecord[] = [
            makeRecord("T#root", "team-1", "security.team", { name: "Alpha" }),
            makeRecord("T#root", "team-2", "security.team", { name: "Beta" }),
            makeRecord("T#root", "group-1", "security.group", { name: "Group-A" }),
            makeRecord("T#root", "user-1", "security.user", { email: "a@b.c" })
        ];
        for (const record of sourceRecords) {
            await doc.put({ TableName: SOURCE_TABLE, Item: record });
        }

        const container = createDdbIntegrationContainer({
            endpoint: instance.endpoint,
            sourceTable: SOURCE_TABLE,
            targetTable: TARGET_TABLE,
            segments: 1
        });

        const runner = container.resolve(PipelineRunner);
        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "integration-passthrough",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        runner.register(await builder.build());

        await runner.run({ segment: 0, totalSegments: 1 });

        const targetRecords = await scanAll(doc, TARGET_TABLE);
        expect(targetRecords).toHaveLength(sourceRecords.length);

        const toKey = (r: BaseRecord): string => `${r.PK}|${r.SK}`;
        const expected = new Map(sourceRecords.map(r => [toKey(r), r]));
        for (const record of targetRecords) {
            expect(expected.get(toKey(record))).toEqual(record);
        }
    });
});

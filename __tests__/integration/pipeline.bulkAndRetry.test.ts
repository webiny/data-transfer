import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { faker } from "@faker-js/faker";
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument, BatchWriteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { PipelineRunner } from "~/features/PipelineRunner/index.js";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.js";
import { DdbScanner } from "~/features/DdbScanner/index.js";
import { DdbProcessor } from "~/features/DdbProcessor/index.js";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";
import { startDynalite, waitForTableActive, type DynaliteInstance } from "./dynalite.ts";
import { createDdbIntegrationContainer } from "./integrationContainer.ts";

const FAKE_CREDS = { accessKeyId: "test", secretAccessKey: "test" };

interface TablePair {
    source: string;
    target: string;
}

interface InitializeArgs {
    input: unknown;
}

type InitializeNext = (args: InitializeArgs) => Promise<unknown>;

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

function makeFakerRecord(idx: number): BaseRecord {
    // Mixes common Webiny-ish shapes: tenant/locale IDs, user-like payloads,
    // nested objects. Deterministic per-index so debugging a failure reproduces.
    faker.seed(idx);
    const tenant = faker.helpers.arrayElement(["root", "tenant-a", "tenant-b"]);
    const locale = faker.helpers.arrayElement(["en-US", "de-DE", "fr-FR"]);
    const userId = faker.string.uuid();
    return {
        PK: `T#${tenant}#L#${locale}#U#${userId}`,
        SK: `rev-${idx}`,
        _et: "CmsEntry",
        _ct: faker.date.past({ years: 3 }).toISOString(),
        _md: faker.date.recent({ days: 30 }).toISOString(),
        TYPE: "cms.entry",
        data: {
            id: userId,
            title: faker.lorem.sentence({ min: 3, max: 8 }),
            description: faker.lorem.paragraph(),
            author: {
                id: faker.string.uuid(),
                name: faker.person.fullName(),
                email: faker.internet.email()
            },
            tags: faker.lorem.words(faker.number.int({ min: 0, max: 4 })).split(" "),
            status: faker.helpers.arrayElement(["draft", "published", "archived"]),
            viewCount: faker.number.int({ min: 0, max: 100_000 })
        }
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

async function scanCount(doc: DynamoDBDocument, tableName: string): Promise<number> {
    let count = 0;
    let lastKey: Record<string, unknown> | undefined;
    do {
        const response = await doc.send(
            new ScanCommand({
                TableName: tableName,
                Select: "COUNT",
                ExclusiveStartKey: lastKey
            })
        );
        count += response.Count ?? 0;
        lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    return count;
}

async function seedBulk(doc: DynamoDBDocument, tableName: string, count: number): Promise<void> {
    const BATCH = 25;
    for (let offset = 0; offset < count; offset += BATCH) {
        const batch: { PutRequest: { Item: BaseRecord } }[] = [];
        const end = Math.min(offset + BATCH, count);
        for (let i = offset; i < end; i++) {
            batch.push({ PutRequest: { Item: makeFakerRecord(i) } });
        }
        await doc.send(new BatchWriteCommand({ RequestItems: { [tableName]: batch } }));
    }
}

/**
 * DynamoDbClientImpl stores the AWS SDK DocumentClient in a private `client`
 * field. Integration tests that inject middleware (throttle simulation,
 * fault injection) need direct access; reach in explicitly rather than
 * widening the production surface.
 */
function getInternalDocClient(ddbClient: unknown): DynamoDBDocument {
    return (ddbClient as { client: DynamoDBDocument }).client;
}

describe("pipeline — bulk + retry against dynalite", () => {
    let instance: DynaliteInstance;
    let doc: DynamoDBDocument;
    let testIndex = 0;

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

    async function freshTables(suite: string): Promise<TablePair> {
        testIndex++;
        const pair: TablePair = {
            source: `${suite}-src-${testIndex}`,
            target: `${suite}-tgt-${testIndex}`
        };
        await createDdbTable(doc, pair.source);
        await createDdbTable(doc, pair.target);
        await waitForTableActive(doc, pair.source);
        await waitForTableActive(doc, pair.target);
        return pair;
    }

    it("transfers 10k records end-to-end, exercising the 25-batch boundary both ways", async () => {
        const RECORD_COUNT = 10_000;
        const tables = await freshTables("bulk");

        await seedBulk(doc, tables.source, RECORD_COUNT);
        expect(await scanCount(doc, tables.source)).toBe(RECORD_COUNT);

        const container = createDdbIntegrationContainer({
            endpoint: instance.endpoint,
            sourceTable: tables.source,
            targetTable: tables.target,
            segments: 1
        });

        const runner = container.resolve(PipelineRunner);
        runner.register(
            await container
                .resolve(PipelineBuilderFactory)
                .create({
                    name: "bulk-passthrough",
                    scanner: DdbScanner,
                    processors: [DdbProcessor]
                })
                .build()
        );

        await runner.run({ segment: 0, totalSegments: 1 });

        expect(await scanCount(doc, tables.target)).toBe(RECORD_COUNT);
    }, 30_000);

    it("retries BatchWriteItem on ProvisionedThroughputExceededException", async () => {
        const RECORD_COUNT = 10;
        const FAIL_ATTEMPTS = 1;
        const tables = await freshTables("throttle");

        for (let i = 0; i < RECORD_COUNT; i++) {
            await doc.put({
                TableName: tables.source,
                Item: makeRecord("T#root", `rec-${i}`, "throttle.item")
            });
        }

        const container = createDdbIntegrationContainer({
            endpoint: instance.endpoint,
            sourceTable: tables.source,
            targetTable: tables.target,
            segments: 1
        });

        const targetClient = getInternalDocClient(container.resolve(TargetDynamoDbClient));
        let injectedFailures = 0;

        // AWS SDK middleware at the "initialize" step: intercept BatchWrite
        // commands and throw a fake ProvisionedThroughputExceededException
        // for the first FAIL_ATTEMPTS calls. executeWithRetry should catch,
        // classify as retryable, back off, and the second attempt succeeds.
        // Typed loosely because the SDK's middleware-type generics don't
        // surface cleanly when adding at runtime.
        const throttleMiddleware = (next: InitializeNext) => {
            return async (args: InitializeArgs): Promise<unknown> => {
                const input = args.input as { RequestItems?: unknown } | undefined;
                const isBatchWrite = Boolean(input?.RequestItems);
                if (!isBatchWrite || injectedFailures >= FAIL_ATTEMPTS) {
                    return await next(args);
                }
                injectedFailures++;
                const err = new Error(
                    "The level of configured provisioned throughput for the table was exceeded."
                ) as Error & { name: string };
                err.name = "ProvisionedThroughputExceededException";
                throw err;
            };
        };
        targetClient.middlewareStack.add(throttleMiddleware as never, {
            step: "initialize",
            name: "throttleInjector"
        });

        const runner = container.resolve(PipelineRunner);
        runner.register(
            await container
                .resolve(PipelineBuilderFactory)
                .create({
                    name: "throttle-passthrough",
                    scanner: DdbScanner,
                    processors: [DdbProcessor]
                })
                .build()
        );

        await runner.run({ segment: 0, totalSegments: 1 });

        expect(injectedFailures).toBe(FAIL_ATTEMPTS);
        expect(await scanCount(doc, tables.target)).toBe(RECORD_COUNT);
    });
});

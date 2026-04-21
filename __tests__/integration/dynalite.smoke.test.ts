import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { startDynalite, type DynaliteInstance } from "./dynalite.ts";

const FAKE_CREDS = { accessKeyId: "test", secretAccessKey: "test" };

describe("dynalite harness — smoke", () => {
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
    });

    afterAll(async () => {
        await instance.stop();
    });

    it("roundtrips a record through a real AWS SDK DocumentClient", async () => {
        await doc.send(
            new CreateTableCommand({
                TableName: "smoke",
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

        await doc.put({
            TableName: "smoke",
            Item: { PK: "tenant-1", SK: "user-1", email: "bruno@webiny.com", count: 42 }
        });

        const result = await doc.get({
            TableName: "smoke",
            Key: { PK: "tenant-1", SK: "user-1" }
        });

        expect(result.Item).toEqual({
            PK: "tenant-1",
            SK: "user-1",
            email: "bruno@webiny.com",
            count: 42
        });
    });
});

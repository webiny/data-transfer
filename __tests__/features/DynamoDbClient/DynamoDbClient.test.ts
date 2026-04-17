import { describe, it, expect, beforeEach } from "vitest";
import { Container } from "@webiny/di";
import {
    SourceDynamoDbClient,
    TargetDynamoDbClient,
    DynamoDbClientConfig,
    DynamoDbClientFeature
} from "../../../src/features/DynamoDbClient/index.ts";
import { MockDynamoDbClient } from "./MockDynamoDbClient.ts";

describe("DynamoDbClient Feature", () => {
    describe("DI registration", () => {
        it("should resolve source and target clients from container", () => {
            const container = new Container();

            container.registerInstance(DynamoDbClientConfig, {
                source: { region: "us-east-1" },
                target: { region: "eu-central-1" }
            });

            DynamoDbClientFeature.register(container);

            const sourceClient = container.resolve(SourceDynamoDbClient);
            const targetClient = container.resolve(TargetDynamoDbClient);

            expect(sourceClient).toBeDefined();
            expect(targetClient).toBeDefined();
            expect(sourceClient).not.toBe(targetClient);
        });

        it("should resolve same instance on multiple resolves (registered as instance)", () => {
            const container = new Container();

            container.registerInstance(DynamoDbClientConfig, {
                source: { region: "us-east-1" },
                target: { region: "eu-central-1" }
            });

            DynamoDbClientFeature.register(container);

            const first = container.resolve(SourceDynamoDbClient);
            const second = container.resolve(SourceDynamoDbClient);

            expect(first).toBe(second);
        });
    });

    describe("MockDynamoDbClient", () => {
        let client: MockDynamoDbClient;

        const testRecords: SourceDynamoDbClient.Record[] = [
            { PK: "T#root#CMS#CME#aaa", SK: "L", TYPE: "cms.entry.l" },
            { PK: "T#root#CMS#CME#aaa", SK: "P", TYPE: "cms.entry.p" },
            { PK: "T#root#CMS#CME#bbb", SK: "L", TYPE: "cms.entry.l" }
        ];

        beforeEach(() => {
            client = new MockDynamoDbClient({
                "test-table": testRecords
            });
        });

        it("should scan all records from a table", async () => {
            const results: SourceDynamoDbClient.Record[] = [];
            for await (const record of client.scan("test-table")) {
                results.push(record);
            }

            expect(results).toHaveLength(3);
        });

        it("should scan with segment filtering", async () => {
            const segment0: SourceDynamoDbClient.Record[] = [];
            for await (const record of client.scan("test-table", {
                segment: 0,
                totalSegments: 2
            })) {
                segment0.push(record);
            }

            const segment1: SourceDynamoDbClient.Record[] = [];
            for await (const record of client.scan("test-table", {
                segment: 1,
                totalSegments: 2
            })) {
                segment1.push(record);
            }

            expect(segment0.length + segment1.length).toBe(3);
        });

        it("should return empty for non-existent table", async () => {
            const results: SourceDynamoDbClient.Record[] = [];
            for await (const record of client.scan("nonexistent")) {
                results.push(record);
            }

            expect(results).toHaveLength(0);
        });

        it("should query by PK", async () => {
            const results = await client.query("test-table", "T#root#CMS#CME#aaa");

            expect(results).toHaveLength(2);
            expect(results[0].SK).toBe("L");
            expect(results[1].SK).toBe("P");
        });

        it("should query by PK and SK", async () => {
            const results = await client.query("test-table", "T#root#CMS#CME#aaa", "L");

            expect(results).toHaveLength(1);
            expect(results[0].SK).toBe("L");
        });

        it("should return empty for non-matching query", async () => {
            const results = await client.query("test-table", "T#root#CMS#CME#zzz");

            expect(results).toHaveLength(0);
        });

        it("should batchPut records and make them scannable", async () => {
            const newRecords: SourceDynamoDbClient.Record[] = [
                { PK: "T#root#CMS#CME#ccc", SK: "L", TYPE: "cms.entry.l" },
                { PK: "T#root#CMS#CME#ddd", SK: "L", TYPE: "cms.entry.l" }
            ];

            await client.batchPut("test-table", newRecords);

            expect(client.batchPutRecords).toHaveLength(2);

            const allRecords: SourceDynamoDbClient.Record[] = [];
            for await (const record of client.scan("test-table")) {
                allRecords.push(record);
            }

            expect(allRecords).toHaveLength(5); // 3 original + 2 new
        });

        it("should batchPut to a new table", async () => {
            const records: SourceDynamoDbClient.Record[] = [
                { PK: "T#root#OS#abc", SK: "L", TYPE: "cms.entry.l" }
            ];

            await client.batchPut("new-table", records);

            const results = await client.query("new-table", "T#root#OS#abc");

            expect(results).toHaveLength(1);
        });

        it("should handle empty batchPut", async () => {
            await client.batchPut("test-table", []);

            expect(client.batchPutRecords).toHaveLength(0);
        });

        it("should support generic type narrowing on scan", async () => {
            interface CmsRecord extends SourceDynamoDbClient.Record {
                TYPE: string;
            }

            const results: CmsRecord[] = [];
            for await (const record of client.scan("test-table")) {
                results.push(record as CmsRecord);
            }

            expect(results[0].TYPE).toBe("cms.entry.l");
        });

        it("should support generic type narrowing on query", async () => {
            interface CmsRecord extends SourceDynamoDbClient.Record {
                TYPE: string;
            }

            const results = await client.query<CmsRecord>("test-table", "T#root#CMS#CME#aaa");

            expect(results[0].TYPE).toBe("cms.entry.l");
        });
    });
});

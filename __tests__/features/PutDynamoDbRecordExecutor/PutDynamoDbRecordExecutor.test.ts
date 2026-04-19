import { beforeEach, describe, expect, it, vi } from "vitest";
import { Container } from "@webiny/di";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { PutDynamoDbRecordExecutorFeature } from "~/features/PutDynamoDbRecordExecutor/feature.ts";
import { PutDynamoDbRecordExecutor } from "~/features/PutDynamoDbRecordExecutor/abstractions/PutDynamoDbRecordExecutor.ts";

describe("PutDynamoDbRecordExecutor", () => {
    let container: Container;
    let client: MockDynamoDbClient;

    beforeEach(() => {
        container = new Container();
        client = new MockDynamoDbClient();
        container.registerInstance(TargetDynamoDbClient, client);
        PutDynamoDbRecordExecutorFeature.register(container);
    });

    it("is a no-op when given an empty array", async () => {
        const executor = container.resolve(PutDynamoDbRecordExecutor);
        const spy = vi.spyOn(client, "batchPut");
        await executor.execute([]);
        expect(spy).not.toHaveBeenCalled();
    });

    it("groups puts by table and calls batchPut once per table", async () => {
        const executor = container.resolve(PutDynamoDbRecordExecutor);
        const spy = vi.spyOn(client, "batchPut").mockResolvedValue();

        await executor.execute([
            PutRecord.create({ table: "t1", record: { PK: "a", SK: "1" } }),
            PutRecord.create({ table: "t2", record: { PK: "b", SK: "2" } }),
            PutRecord.create({ table: "t1", record: { PK: "c", SK: "3" } })
        ]);

        expect(spy).toHaveBeenCalledTimes(2);
        const callArgs = spy.mock.calls.map(([table, records]) => [table, records.length]);
        expect(callArgs).toEqual(
            expect.arrayContaining([
                ["t1", 2],
                ["t2", 1]
            ])
        );
    });

    it("passes record data verbatim to batchPut", async () => {
        const executor = container.resolve(PutDynamoDbRecordExecutor);
        const spy = vi.spyOn(client, "batchPut").mockResolvedValue();
        const record = { PK: "pk", SK: "sk", custom: 42 };

        await executor.execute([PutRecord.create({ table: "t", record })]);

        expect(spy).toHaveBeenCalledWith("t", [record]);
    });
});

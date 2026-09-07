import { describe, it, expect, vi } from "vitest";
import { DynamoDbClientImpl } from "../../../src/services/DynamoDbClient/DynamoDbClient.ts";
import { NoopLogger } from "../../helpers/NoopLogger.ts";

interface SendInput {
    input: Record<string, unknown>;
}

function makeClient(): { client: DynamoDbClientImpl; send: ReturnType<typeof vi.fn> } {
    const client = new DynamoDbClientImpl({ region: "us-east-1" }, new NoopLogger(), {
        maxRetries: 0,
        initialBackoffMs: 1
    });
    const send = vi.fn();
    vi.spyOn(
        (client as unknown as { client: { send: () => unknown } }).client,
        "send"
    ).mockImplementation(send);
    return { client, send };
}

describe("DynamoDbClientImpl.scan options", () => {
    it("adds FilterExpression SK = :sk when sortKeyEquals is set", async () => {
        const { client, send } = makeClient();
        send.mockResolvedValue({ Items: [{ PK: "a", SK: "L" }] });

        const rows = [];
        for await (const row of client.scan("t", { sortKeyEquals: "L" })) {
            rows.push(row);
        }

        const input = (send.mock.calls[0]![0] as SendInput).input;
        expect(input.FilterExpression).toBe("SK = :sk");
        expect(input.ExpressionAttributeValues).toEqual({ ":sk": "L" });
        expect(rows).toHaveLength(1);
    });

    it("stops after `limit` yielded items even when more pages exist", async () => {
        const { client, send } = makeClient();
        send.mockResolvedValue({
            Items: [
                { PK: "a", SK: "L" },
                { PK: "b", SK: "L" },
                { PK: "c", SK: "L" }
            ],
            LastEvaluatedKey: { PK: "c", SK: "L" }
        });

        const rows = [];
        for await (const row of client.scan("t", { limit: 2 })) {
            rows.push(row);
        }

        expect(rows).toHaveLength(2);
        expect(send).toHaveBeenCalledTimes(1);
        expect((send.mock.calls[0]![0] as SendInput).input.Limit).toBe(2);
    });
});

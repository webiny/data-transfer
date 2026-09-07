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

function conditionalCheckFailed(): Error {
    const error = new Error("The conditional request failed");
    error.name = "ConditionalCheckFailedException";
    return error;
}

describe("DynamoDbClientImpl.updateAttribute", () => {
    it("builds a SET path expression with a condition and returns written", async () => {
        const { client, send } = makeClient();
        send.mockResolvedValue({});

        const result = await client.updateAttribute("t", {
            key: { PK: "p", SK: "L" },
            path: ["data", "live"],
            value: { version: 2 },
            condition: { attribute: "_md", equals: "md-1" }
        });

        expect(result).toBe("written");
        const input = (send.mock.calls[0]![0] as SendInput).input;
        expect(input.TableName).toBe("t");
        expect(input.Key).toEqual({ PK: "p", SK: "L" });
        expect(input.UpdateExpression).toBe("SET #p0.#p1 = :v");
        expect(input.ConditionExpression).toBe("#c = :c");
        expect(input.ExpressionAttributeNames).toEqual({
            "#p0": "data",
            "#p1": "live",
            "#c": "_md"
        });
        expect(input.ExpressionAttributeValues).toEqual({
            ":v": { version: 2 },
            ":c": "md-1"
        });
    });

    it("returns condition-failed on ConditionalCheckFailedException without retrying", async () => {
        const { client, send } = makeClient();
        send.mockRejectedValue(conditionalCheckFailed());

        const result = await client.updateAttribute("t", {
            key: { PK: "p", SK: "L" },
            path: ["data", "live"],
            value: null,
            condition: { attribute: "_md", equals: "md-1" }
        });

        expect(result).toBe("condition-failed");
        expect(send).toHaveBeenCalledTimes(1);
    });

    it("propagates every other error", async () => {
        const { client, send } = makeClient();
        const error = new Error("boom");
        error.name = "ValidationException";
        send.mockRejectedValue(error);

        await expect(
            client.updateAttribute("t", {
                key: { PK: "p", SK: "L" },
                path: ["data"],
                value: {},
                condition: { attribute: "_md", equals: "x" }
            })
        ).rejects.toMatchObject({ name: "ValidationException" });
    });
});

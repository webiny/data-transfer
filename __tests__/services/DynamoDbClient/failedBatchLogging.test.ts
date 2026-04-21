import { describe, it, expect, vi } from "vitest";
import { DynamoDbClientImpl } from "../../../src/services/DynamoDbClient/DynamoDbClient.ts";
import { NoopLogger } from "../../helpers/NoopLogger.ts";

interface RetryableAwsError extends Error {
    name: string;
    $metadata: { httpStatusCode: number };
}

function makeRetryableError(): RetryableAwsError {
    const error = new Error("Internal server error") as RetryableAwsError;
    error.name = "InternalServerError";
    error.$metadata = { httpStatusCode: 500 };
    return error;
}

describe("DynamoDbClientImpl batchPut failure logging", () => {
    it("logs PK/SK list on final retry failure and rethrows", async () => {
        const logger = new NoopLogger();
        const client = new DynamoDbClientImpl({ region: "us-east-1" }, logger, {
            maxRetries: 1,
            initialBackoffMs: 1
        });

        const sendSpy = vi
            .spyOn((client as unknown as { client: { send: () => unknown } }).client, "send")
            .mockRejectedValue(makeRetryableError());

        const records = [
            { PK: "T#root#CMS#CME#aaa", SK: "L" },
            { PK: "T#root#CMS#CME#bbb", SK: "P" }
        ];

        await expect(client.batchPut("target-table", records)).rejects.toMatchObject({
            name: "InternalServerError"
        });

        expect(sendSpy).toHaveBeenCalledTimes(2);

        const errorLogs = logger.entries.filter(entry => entry.level === "error");
        expect(errorLogs).toHaveLength(1);
        expect(errorLogs[0].message).toContain("DynamoDB batchPut failed");
        expect(errorLogs[0].message).toContain('table "target-table"');
        expect(errorLogs[0].message).toContain("T#root#CMS#CME#aaa");
        expect(errorLogs[0].message).toContain("T#root#CMS#CME#bbb");
    });

    it("does not log when batch succeeds on first attempt", async () => {
        const logger = new NoopLogger();
        const client = new DynamoDbClientImpl({ region: "us-east-1" }, logger, {
            maxRetries: 1,
            initialBackoffMs: 1
        });

        vi.spyOn(
            (client as unknown as { client: { send: () => unknown } }).client,
            "send"
        ).mockResolvedValue({});

        await client.batchPut("target-table", [{ PK: "a", SK: "b" }]);

        const errorLogs = logger.entries.filter(entry => entry.level === "error");
        expect(errorLogs).toHaveLength(0);
    });
});

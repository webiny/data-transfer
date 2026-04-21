import { describe, it, expect, vi } from "vitest";
import { S3ClientImpl } from "../../../src/services/S3Client/S3Client.ts";
import { NoopLogger } from "../../helpers/NoopLogger.ts";

interface RetryableAwsError extends Error {
    name: string;
    $metadata: { httpStatusCode: number };
}

function makeRetryableError(): RetryableAwsError {
    const error = new Error("Service unavailable") as RetryableAwsError;
    error.name = "ServiceUnavailable";
    error.$metadata = { httpStatusCode: 503 };
    return error;
}

const FAKE_CREDS = { accessKeyId: "AKIA", secretAccessKey: "secret" };

describe("S3ClientImpl batchCopy failure logging", () => {
    it("logs source/target keys on final retry failure and rethrows", async () => {
        const logger = new NoopLogger();
        const client = new S3ClientImpl({ region: "us-east-1", credentials: FAKE_CREDS }, logger, {
            maxRetries: 1,
            initialBackoffMs: 1,
            concurrency: 2
        });

        vi.spyOn(
            (client as unknown as { client: { send: () => unknown } }).client,
            "send"
        ).mockRejectedValue(makeRetryableError());

        const operations = [
            {
                sourceBucket: "src-bucket",
                sourceKey: "files/abc.png",
                targetBucket: "tgt-bucket",
                targetKey: "files/abc.png"
            }
        ];

        await expect(client.batchCopy(operations)).rejects.toMatchObject({
            name: "ServiceUnavailable"
        });

        const errorLogs = logger.entries.filter(entry => entry.level === "error");
        expect(errorLogs).toHaveLength(1);
        expect(errorLogs[0].message).toContain("S3 copy failed");
        expect(errorLogs[0].message).toContain("src-bucket/files/abc.png");
        expect(errorLogs[0].message).toContain("tgt-bucket/files/abc.png");
    });

    it("does not log when copy succeeds on first attempt", async () => {
        const logger = new NoopLogger();
        const client = new S3ClientImpl({ region: "us-east-1", credentials: FAKE_CREDS }, logger, {
            maxRetries: 1,
            initialBackoffMs: 1,
            concurrency: 2
        });

        vi.spyOn(
            (client as unknown as { client: { send: () => unknown } }).client,
            "send"
        ).mockResolvedValue({});

        await client.batchCopy([
            {
                sourceBucket: "src",
                sourceKey: "k",
                targetBucket: "tgt",
                targetKey: "k"
            }
        ]);

        const errorLogs = logger.entries.filter(entry => entry.level === "error");
        expect(errorLogs).toHaveLength(0);
    });
});

import { describe, it, expect } from "vitest";
import { isRetryableAwsError } from "~/base/index.js";

describe("isRetryableAwsError", () => {
    it("returns false for null / undefined / non-objects", () => {
        expect(isRetryableAwsError(null)).toBe(false);
        expect(isRetryableAwsError(undefined)).toBe(false);
        expect(isRetryableAwsError("oops")).toBe(false);
        expect(isRetryableAwsError(42)).toBe(false);
    });

    it("returns true for known DynamoDB throttle names", () => {
        expect(isRetryableAwsError({ name: "ProvisionedThroughputExceededException" })).toBe(true);
        expect(isRetryableAwsError({ name: "ThrottlingException" })).toBe(true);
        expect(isRetryableAwsError({ name: "RequestLimitExceeded" })).toBe(true);
    });

    it("returns true for known S3 throttle names", () => {
        expect(isRetryableAwsError({ name: "SlowDown" })).toBe(true);
        expect(isRetryableAwsError({ name: "RequestTimeout" })).toBe(true);
        expect(isRetryableAwsError({ name: "ServiceUnavailable" })).toBe(true);
    });

    it("returns true for account-wide / AWS-internal throttle names", () => {
        expect(isRetryableAwsError({ name: "TooManyRequestsException" })).toBe(true);
        expect(isRetryableAwsError({ name: "LimitExceededException" })).toBe(true);
        expect(isRetryableAwsError({ name: "InternalFailure" })).toBe(true);
        expect(isRetryableAwsError({ name: "InternalServerError" })).toBe(true);
    });

    it("returns true for node-level socket errors via .code", () => {
        expect(isRetryableAwsError({ code: "ECONNRESET" })).toBe(true);
        expect(isRetryableAwsError({ code: "ETIMEDOUT" })).toBe(true);
        expect(isRetryableAwsError({ code: "ENOTFOUND" })).toBe(true);
    });

    it("returns true for retryable HTTP status codes via $metadata", () => {
        expect(isRetryableAwsError({ $metadata: { httpStatusCode: 429 } })).toBe(true);
        expect(isRetryableAwsError({ $metadata: { httpStatusCode: 500 } })).toBe(true);
        expect(isRetryableAwsError({ $metadata: { httpStatusCode: 502 } })).toBe(true);
        expect(isRetryableAwsError({ $metadata: { httpStatusCode: 503 } })).toBe(true);
        expect(isRetryableAwsError({ $metadata: { httpStatusCode: 504 } })).toBe(true);
    });

    it("returns true when $retryable.throttling is set regardless of other fields", () => {
        expect(isRetryableAwsError({ name: "RandomName", $retryable: { throttling: true } })).toBe(
            true
        );
    });

    it("returns false for non-retryable error shapes", () => {
        expect(isRetryableAwsError({ name: "ValidationException" })).toBe(false);
        expect(isRetryableAwsError({ name: "AccessDeniedException" })).toBe(false);
        expect(isRetryableAwsError({ name: "ResourceNotFoundException" })).toBe(false);
        expect(isRetryableAwsError({ $metadata: { httpStatusCode: 400 } })).toBe(false);
        expect(isRetryableAwsError({ $metadata: { httpStatusCode: 403 } })).toBe(false);
    });
});

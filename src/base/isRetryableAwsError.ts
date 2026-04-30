const RETRYABLE_ERROR_NAMES = new Set<string>([
    // DynamoDB throttles
    "ProvisionedThroughputExceededException",
    "ThrottlingException",
    "RequestLimitExceeded",
    "TransactionCanceledException",

    // S3 throttles
    "SlowDown",
    "RequestTimeout",
    "RequestTimeTooSkewed",
    "ServiceUnavailable",

    // Account-wide / cross-service throttles
    "TooManyRequestsException",
    "LimitExceededException",
    "Throttling",

    // AWS internal
    "InternalFailure",
    "InternalServerError",
    "InternalError",

    // Node-level
    "ECONNRESET",
    "ETIMEDOUT",
    "EPIPE",
    "ENOTFOUND"
]);

const RETRYABLE_STATUS_CODES = new Set<number>([408, 425, 429, 500, 502, 503, 504]);

interface AwsErrorLike {
    name?: string;
    code?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
    $retryable?: { throttling?: boolean };
}

/**
 * Classifies whether an AWS SDK / network error is worth retrying.
 *
 * Covers: DynamoDB throttles, S3 throttles, account-wide API quotas,
 * transient AWS internal failures, HTTP 429/5xx, and node-level socket
 * errors. Everything else (auth, validation, bad-request, resource-not-
 * found) fails fast.
 */
export function isRetryableAwsError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }
    const candidate = error as AwsErrorLike;

    if (candidate.$retryable?.throttling === true) {
        return true;
    }

    const name = candidate.name ?? candidate.code;
    if (typeof name === "string" && RETRYABLE_ERROR_NAMES.has(name)) {
        return true;
    }

    const status = candidate.$metadata?.httpStatusCode;
    if (typeof status === "number" && RETRYABLE_STATUS_CODES.has(status)) {
        return true;
    }

    // SDK adaptive retry token bucket exhausted — back off and let it replenish.
    if (typeof candidate.message === "string" && candidate.message.includes("retry token")) {
        return true;
    }

    return false;
}

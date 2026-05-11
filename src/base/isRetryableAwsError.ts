// Auth/permission errors are never transient — fail immediately without retrying.
const TERMINAL_ERROR_NAMES = new Set<string>([
    "AccessDenied",
    "AccessDeniedException",
    "AuthorizationError",
    "AuthorizationErrorException",
    "UnauthorizedOperation"
]);

const THROTTLING_ERROR_NAMES = new Set<string>([
    "ProvisionedThroughputExceededException",
    "ThrottlingException",
    "RequestLimitExceeded",
    "SlowDown",
    "TooManyRequestsException",
    "LimitExceededException",
    "Throttling"
]);

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

export interface AwsErrorLike {
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

    // Auth/permission failures are permanent — never retry.
    const nameForTerminal = candidate.name ?? candidate.code;
    if (typeof nameForTerminal === "string" && TERMINAL_ERROR_NAMES.has(nameForTerminal)) {
        return false;
    }
    const httpStatus = candidate.$metadata?.httpStatusCode;
    if (httpStatus === 403) {
        return false;
    }

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
    if (isTokenBucketExhausted(error)) {
        return true;
    }

    return false;
}

/**
 * Returns true when the error is a service-level throttle (rate limit exceeded),
 * as opposed to a transient network or server error.
 */
export function isThrottlingError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }
    const candidate = error as AwsErrorLike;

    if (candidate.$retryable?.throttling === true) {
        return true;
    }

    const name = candidate.name ?? candidate.code;
    if (typeof name === "string" && THROTTLING_ERROR_NAMES.has(name)) {
        return true;
    }

    const status = candidate.$metadata?.httpStatusCode;
    return status === 429;
}

/**
 * Returns true when the error indicates an IAM / credentials access denial.
 * Covers DynamoDB AccessDeniedException, S3 AccessDenied, and HTTP 403.
 */
export function isAccessDeniedError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }
    const candidate = error as AwsErrorLike;
    const name = candidate.name ?? candidate.code;
    if (typeof name === "string" && TERMINAL_ERROR_NAMES.has(name)) {
        return true;
    }
    return candidate.$metadata?.httpStatusCode === 403;
}

/**
 * Returns true when the AWS SDK adaptive retry token bucket is depleted.
 * Callers should use a longer minimum backoff (≥10s) so the bucket has time
 * to refill before the next attempt.
 */
export function isTokenBucketExhausted(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }
    const { message } = error as { message?: unknown };
    return typeof message === "string" && message.includes("retry token");
}

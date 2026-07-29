export interface AwsErrorLike {
  name?: string;
  code?: string;
  message?: string;
  $metadata?: {
    httpStatusCode?: number;
  };
  $retryable?: {
    throttling?: boolean;
  };
}
/**
 * Classifies whether an AWS SDK / network error is worth retrying.
 *
 * Covers: DynamoDB throttles, S3 throttles, account-wide API quotas,
 * transient AWS internal failures, HTTP 429/5xx, and node-level socket
 * errors. Everything else (auth, validation, bad-request, resource-not-
 * found) fails fast.
 */
export declare function isRetryableAwsError(error: unknown): boolean;
/**
 * Returns true when the error is a service-level throttle (rate limit exceeded),
 * as opposed to a transient network or server error.
 */
export declare function isThrottlingError(error: unknown): boolean;
/**
 * Returns true when the error indicates an IAM / credentials access denial.
 * Covers DynamoDB AccessDeniedException, S3 AccessDenied, and HTTP 403.
 */
export declare function isAccessDeniedError(error: unknown): boolean;
/**
 * Returns true when the AWS SDK adaptive retry token bucket is depleted.
 * Callers should use a longer minimum backoff (≥10s) so the bucket has time
 * to refill before the next attempt.
 */
export declare function isTokenBucketExhausted(error: unknown): boolean;
//# sourceMappingURL=isRetryableAwsError.d.ts.map

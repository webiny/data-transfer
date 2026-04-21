# AWS Retry + Error Classification Design

**Date:** 2026-04-19
**Package:** `@webiny/data-transfer`
**Closes:** the "we get throttling errors and the tool doesn't handle them well" gap for DDB, S3, and OpenSearch clients.

---

## Goal

Reduce the operational pain of AWS throttling during migrations without asking users to guess AWS limits (they can't — limits are dynamic, account-specific, and change).

Three concrete outcomes:

1. A unified retry classifier (`isRetryableAwsError`) replaces three separate hardcoded lists across `DynamoDbClient`, `S3Client`, and `OsCommandExecutor`. Broader coverage: account-wide throttles, AWS-internal failures, HTTP 5xx, node-level socket errors.
2. DDB + S3 SDK clients opt into the AWS SDK v3 `retryMode: "adaptive"` strategy. The SDK's own built-in token bucket ramps up/down based on observed throttle rate — self-tuning, no user-declared budget.
3. OpenSearch Client gets its built-in `maxRetries` wired to `tuning.os.maxRetries`; `OsCommandExecutor.withRetry` becomes classifier-gated so non-throttle errors fail fast instead of burning the full retry schedule.

## Scope

### In

- `src/base/isRetryableAwsError.ts` — the classifier.
- `src/base/index.ts` — export it alongside `formatError`.
- `src/services/DynamoDbClient/DynamoDbClient.ts` — pass `retryMode: "adaptive"`; `executeWithRetry` uses classifier.
- `src/services/S3Client/S3Client.ts` — pass `retryMode: "adaptive"`; `executeWithRetry` uses classifier.
- `src/services/OpenSearchClient/OpenSearchClient.ts` — pass `maxRetries` from `tuning.os.maxRetries`.
- `src/features/OpenSearchClient/feature.ts` — pipe `tuning.os.maxRetries` through; the OS client currently takes the config as an instance; feature resolves `MigrationConfig` to read tuning.
- `src/features/OsCommandExecutor/OsCommandExecutor.ts` — `withRetry` classifier-gated.
- `src/features/MigrationConfig/schemas/shared.schema.ts` — add `tuning.os.maxRetries?: number`.
- Unit tests for the classifier and each client's retry behavior.

### Out

- Rate limiting via user-declared `perSecond` budget — dropped in favor of SDK's adaptive mode. Users can't reliably name the right number; the SDK probes the ceiling itself.
- Cross-worker coordination (one global bucket across N workers). Not needed — each worker's SDK client runs its own adaptive bucket; AWS sees N × (per-worker adaptive rate), and throttles if that collective exceeds the account limit. Adaptive mode per worker still responds correctly.
- Structured retry telemetry ("throttled 47 times during this run"). Deferred; users can enable SDK logging if they need it.

## Architecture

Existing retry architecture keeps its three layers; this spec improves each one.

**Layer 1 — SDK-native retry** (inside `@aws-sdk/*` client): fires on every call, adaptive rate + exponential backoff + jitter. Currently default (`standard` mode); this spec switches to `adaptive` for DDB and S3. OpenSearch (non-AWS-SDK) uses opensearch-js's own `maxRetries` with fixed count.

**Layer 2 — our `executeWithRetry` wrapper**: belt-and-suspenders outer loop around the SDK. The SDK can give up after its attempts; we catch the thrown error, check via classifier, and retry with our own backoff. Without changes, this was too narrow (each client had a short hardcoded list); classifier broadens it.

**Layer 3 — orchestrator-level**: unchanged. `run` handler uses `Promise.allSettled`, runs after-hooks best-effort.

### `isRetryableAwsError`

```typescript
// src/base/isRetryableAwsError.ts

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
    $metadata?: { httpStatusCode?: number };
    $retryable?: { throttling?: boolean };
}

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
    return false;
}
```

Pure function, no imports, duck-typed. Unit-test each branch.

### DDB client

```typescript
this.client = getDocumentClient({
    region: config.region,
    ...(config.credentials && { credentials: config.credentials }),
    ...(config.endpoint && { endpoint: config.endpoint }),
    retryMode: "adaptive"
});
```

`executeWithRetry` body changes the retry guard from a hardcoded `isRetryable` ternary to `isRetryableAwsError(error)`. Attempt count, backoff math unchanged.

### S3 client

```typescript
this.client = createS3Client({
    region: config.region,
    credentials: config.credentials,
    retryMode: "adaptive"
});
```

Same `executeWithRetry` body change.

### OpenSearch client

```typescript
this.client = new Client({
    ...AwsSigv4Signer({ ... }),
    node: config.endpoint,
    maxRetries: config.maxRetries ?? 3
});
```

`OpenSearchClientConfig.Interface` gains an optional `maxRetries?: number`. The `OpenSearchClientFeature` reads `tuning.os.maxRetries` from `MigrationConfig` when assembling the config instance.

### `OsCommandExecutor.withRetry`

```typescript
private async withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
    let lastError: Error | undefined;
    const schedule = this.retrySchedule;

    for (let attempt = 0; attempt <= schedule.length; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            if (!isRetryableAwsError(error)) {
                throw error;
            }
            if (attempt < schedule.length) {
                const wait = schedule[attempt];
                this.logger.warn(
                    `${label} failed (attempt ${attempt + 1}/${schedule.length + 1}). Retrying in ${wait / 1000}s...`
                );
                await new Promise(resolve => setTimeout(resolve, wait));
            }
        }
    }
    throw lastError;
}
```

Behavior change: non-throttle errors (e.g., a 400 with a clear validation problem) now fail immediately instead of burning through a 95-second retry schedule.

## Config additions

Extend `tuningSchema` in `src/features/MigrationConfig/schemas/shared.schema.ts`:

```typescript
os: z.object({
    retryScheduleMs: z.array(z.number().int().nonnegative()).optional(),
    maxRetries: z.number().int().nonnegative().optional()
}).optional()
```

No other tuning changes. `tuning.ddb` and `tuning.s3` stay as-is — their existing `maxRetries` / `initialBackoffMs` still drive our outer `executeWithRetry` layer.

The `rateLimit.perSecond` field earlier proposed is NOT added — we pivoted to SDK-adaptive.

## Testing strategy

### New

- **`__tests__/base/isRetryableAwsError.test.ts`** — one test per branch:
  - ZodError-like / plain object → false.
  - Error with retryable name → true.
  - Error with non-retryable name → false.
  - Error with `$metadata.httpStatusCode` in retryable set → true.
  - Error with `$metadata.httpStatusCode` 400 → false.
  - `$retryable.throttling === true` → true regardless of name/status.
  - Node-level `ECONNRESET` via `.code` → true.
  - null / undefined / string → false.

- **`__tests__/features/OsCommandExecutor/OsCommandExecutor.classifier.test.ts`** — one new case:
  - "non-throttle error fails fast without exhausting the retry schedule" — stub `osClient.createIndex` to throw a non-retryable error; execute; expect error thrown within one attempt, logger.warn not called with "Retrying in...".

### Updated

- **`__tests__/features/OsCommandExecutor/OsCommandExecutor.test.ts`** — the existing retry tests that currently rely on blanket-retry-any-error get updated to use classifier-matched errors (e.g., `ServiceUnavailable`). Anything that asserts retry-on-random-error is reinterpreted: if the intent was "retry on transient failure", switch to a retryable shape; if the intent was "always retry", assert the new fail-fast behavior.

### Unchanged

- DDB + S3 client retry tests (if any). Happy-path tests still pass. If existing tests rely on specific retryable error names, those names remain in the new classifier; tests continue to work.
- End-to-end + integration tests — retry behavior is internal to the client; observable behavior (writes land on target) is unchanged.

## Risks / follow-ups

1. **SDK `adaptive` mode is slower to warm up than `standard`.** On a tiny, never-throttled migration the SDK probes the ceiling by starting conservative then ramping. For sub-10-second migrations this is imperceptible; for longer ones the adaptive bucket reaches steady-state within the first few seconds. If anyone complains about "why did my 5-record test run feel sluggish," we can expose `retryMode` as a tuning knob (`"adaptive"` default, `"standard"` opt-out).

2. **`OsCommandExecutor.withRetry` fail-fast on non-classifier errors is a behavior change.** Today an errant 400 (e.g., a bad mapping) triggers 5 retries over ~95 seconds before bubbling up. After this change it bubbles immediately. Net improvement — users get faster feedback on real bugs — but worth flagging in the commit message.

3. **opensearch-js `maxRetries` is count-based, not adaptive.** If the OS cluster hits a sustained 429 wave, we'll see it after `maxRetries` attempts. The outer `OsCommandExecutor.withRetry` catches it and retries per `retryScheduleMs`. Effective behavior: `maxRetries` (inner) × schedule.length (outer) retries. Users tuning deeply can adjust both; defaults (3 × 5) are usually enough.

4. **No telemetry.** Users won't see "we retried 47 times due to throttling" at end of run. If throttling becomes a serious operational concern, add a retry counter per client, surface via shard-state files, summarize at orchestrator. Deferred follow-up.

5. **AWS SDK adaptive mode is per-client-per-process.** Our 4-worker run has 4 independent adaptive buckets per service. If you set them all to "adaptive", AWS will collectively see ~4× the traffic of one client before rate-adjusting, but each client will independently back off when it sees throttles. Effective behavior: collective rate converges on (account limit) divided among workers, with some oscillation. Not a problem for typical migrations; if migrations-with-many-workers become the norm, revisit with shared-bucket coordination (separate spec).

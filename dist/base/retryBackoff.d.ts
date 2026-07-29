/**
 * Exponential backoff with ±25% jitter and a 30-second cap.
 *
 * Formula: `base = min(initialMs * 2^attempt, 30_000)`;
 * returned value is uniformly distributed in `[base * 0.75, base * 1.25]`.
 *
 * Jitter matters when many workers hit the same transient error at the
 * same moment — without it they all retry in lockstep and hit the
 * struggling backend together. Cap keeps pathological retry counts from
 * producing multi-minute waits.
 */
export declare function retryBackoffMs(attempt: number, initialMs: number): number;
//# sourceMappingURL=retryBackoff.d.ts.map

const MAX_BACKOFF_MS = 30_000;
const JITTER_SPREAD = 0.25; // ±25% of the computed base
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
export function retryBackoffMs(attempt, initialMs) {
  const base = Math.min(initialMs * Math.pow(2, attempt), MAX_BACKOFF_MS);
  const factor = 1 - JITTER_SPREAD + Math.random() * (JITTER_SPREAD * 2);
  return Math.floor(base * factor);
}
//# sourceMappingURL=retryBackoff.js.map

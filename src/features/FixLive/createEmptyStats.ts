import type { LiveFieldReconciler } from "./abstractions/LiveFieldReconciler.ts";
import type { LiveFieldRunner } from "./abstractions/LiveFieldRunner.ts";

export const CHANGE_REASONS: readonly LiveFieldReconciler.ChangeReason[] = [
    "missing-live",
    "empty-live",
    "wrong-version",
    "stale-live"
];

export const SKIP_REASONS: readonly LiveFieldReconciler.SkipReason[] = [
    "no-latest-record",
    "invalid-version",
    "revision-record-missing",
    "revision-version-mismatch",
    "latest-status-contradicts-published",
    "latest-status-contradicts-unpublished",
    "decompress-failed",
    "changed-during-run"
];

export function createEmptyStats(): LiveFieldRunner.Stats {
    const changes = Object.fromEntries(CHANGE_REASONS.map(reason => [reason, 0])) as Record<
        LiveFieldReconciler.ChangeReason,
        number
    >;
    const skips = Object.fromEntries(SKIP_REASONS.map(reason => [reason, 0])) as Record<
        LiveFieldReconciler.SkipReason,
        number
    >;
    return { scanned: 0, entries: 0, changes, skips, written: 0, conditionFailed: 0 };
}

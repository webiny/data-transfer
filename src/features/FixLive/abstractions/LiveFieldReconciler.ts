import { createAbstraction } from "~/base/index.js";
import type { DatabaseRecord } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";

export type LiveFieldTable = "ddb" | "os";

export interface ReconcilableRecord extends DatabaseRecord {
    _md: string;
    data: Record<string, unknown>;
}

export interface LiveFieldGroup {
    pk: string;
    table: LiveFieldTable;
    records: Map<string, ReconcilableRecord>;
}

export interface LiveFieldValue {
    version: number;
}

export type LiveFieldChangeReason = "missing-live" | "empty-live" | "wrong-version" | "stale-live";

export type LiveFieldSkipReason =
    | "no-latest-record"
    | "invalid-version"
    | "revision-record-missing"
    | "revision-version-mismatch"
    | "latest-status-contradicts-published"
    | "latest-status-contradicts-unpublished"
    | "decompress-failed"
    | "changed-during-run";

export interface LiveFieldChange {
    pk: string;
    sk: string;
    before: unknown;
    after: LiveFieldValue | null;
    reason: LiveFieldChangeReason;
    expectedMd: string;
}

export interface LiveFieldSkip {
    pk: string;
    sk?: string;
    reason: LiveFieldSkipReason;
    detail?: string;
}

export interface LiveFieldDecision {
    changes: LiveFieldChange[];
    skips: LiveFieldSkip[];
}

export interface ILiveFieldReconciler {
    decide(group: LiveFieldGroup): LiveFieldDecision;
}

export const LiveFieldReconciler = createAbstraction<ILiveFieldReconciler>("FixLive/Reconciler");

export namespace LiveFieldReconciler {
    export type Interface = ILiveFieldReconciler;
    export type Table = LiveFieldTable;
    export type Record = ReconcilableRecord;
    export type Group = LiveFieldGroup;
    export type LiveValue = LiveFieldValue;
    export type Change = LiveFieldChange;
    export type Skip = LiveFieldSkip;
    export type Decision = LiveFieldDecision;
    export type ChangeReason = LiveFieldChangeReason;
    export type SkipReason = LiveFieldSkipReason;
}

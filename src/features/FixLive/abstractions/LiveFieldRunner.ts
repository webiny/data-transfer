import { createAbstraction } from "~/base/index.js";
import type { SourceDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import type { LiveFieldReconciler } from "./LiveFieldReconciler.ts";
import type { ChangeReport } from "./ChangeReport.ts";

export type LiveFieldRunMode = "dry-run" | "live";

export interface LiveFieldRunTarget {
    client: SourceDynamoDbClient.Interface;
    tableName: string;
    segments: number;
    concurrency?: number;
    writeConcurrency?: number;
}

export interface LiveFieldRunStats {
    scanned: number;
    entries: number;
    changes: Record<LiveFieldReconciler.ChangeReason, number>;
    skips: Record<LiveFieldReconciler.SkipReason, number>;
    written: number;
    conditionFailed: number;
}

export interface LiveFieldRunOptions {
    mode: LiveFieldRunMode;
    target: LiveFieldRunTarget;
    report: ChangeReport.Interface;
    onProgress(stats: LiveFieldRunStats): void;
}

export interface ILiveFieldRunner {
    run(options: LiveFieldRunOptions): Promise<LiveFieldRunStats>;
}

export const DdbLiveFieldRunner = createAbstraction<ILiveFieldRunner>("FixLive/DdbRunner");
export const OsLiveFieldRunner = createAbstraction<ILiveFieldRunner>("FixLive/OsRunner");

export namespace LiveFieldRunner {
    export type Interface = ILiveFieldRunner;
    export type Mode = LiveFieldRunMode;
    export type Target = LiveFieldRunTarget;
    export type Options = LiveFieldRunOptions;
    export type Stats = LiveFieldRunStats;
}

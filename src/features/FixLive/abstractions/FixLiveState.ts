import { createAbstraction } from "~/base/index.js";

export interface FixLiveRunSummary {
    runId: string;
    at: string;
    changes: number;
    skips: number;
}

export interface FixLiveLiveRunSummary extends FixLiveRunSummary {
    written: number;
    conditionFailed: number;
}

export interface FixLiveStateFile {
    lastDryRun?: FixLiveRunSummary;
    lastLiveRun?: FixLiveLiveRunSummary;
}

export interface FixLiveStateKey {
    project: string;
    system: "source" | "target";
}

export interface IFixLiveState {
    pathFor(key: FixLiveStateKey): string;
    read(key: FixLiveStateKey): FixLiveStateFile | null;
    recordDryRun(key: FixLiveStateKey, summary: FixLiveRunSummary): void;
    recordLiveRun(key: FixLiveStateKey, summary: FixLiveLiveRunSummary): void;
}

export const FixLiveState = createAbstraction<IFixLiveState>("FixLive/State");

export namespace FixLiveState {
    export type Interface = IFixLiveState;
    export type Key = FixLiveStateKey;
    export type RunSummary = FixLiveRunSummary;
    export type LiveRunSummary = FixLiveLiveRunSummary;
    export type File = FixLiveStateFile;
}

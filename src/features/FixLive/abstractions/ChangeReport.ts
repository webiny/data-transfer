import { createAbstraction } from "~/base/index.js";
import type { LiveFieldReconciler } from "./LiveFieldReconciler.ts";

export type ChangeReportResult = "dry-run" | "written" | "condition-failed";

export interface ChangeReportChange {
    table: LiveFieldReconciler.Table;
    pk: string;
    sk: string;
    reason: LiveFieldReconciler.ChangeReason;
    before: unknown;
    after: LiveFieldReconciler.LiveValue | null;
    result: ChangeReportResult;
}

export interface ChangeReportSkip {
    table: LiveFieldReconciler.Table;
    pk: string;
    sk?: string;
    reason: LiveFieldReconciler.SkipReason;
    detail?: string;
}

export interface IChangeReport {
    readonly path: string;
    change(entry: ChangeReportChange): void;
    skip(entry: ChangeReportSkip): void;
}

export const ChangeReport = createAbstraction<IChangeReport>("FixLive/ChangeReport");

export namespace ChangeReport {
    export type Interface = IChangeReport;
    export type Result = ChangeReportResult;
    export type Change = ChangeReportChange;
    export type Skip = ChangeReportSkip;
}

import type { DatabaseRecord } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import type { Logger } from "~/tools/Logger/abstractions/Logger.js";
import type { LiveFieldReconciler } from "./abstractions/LiveFieldReconciler.ts";
import type { LiveFieldRunner } from "./abstractions/LiveFieldRunner.ts";
import type { ChangeReport } from "./abstractions/ChangeReport.ts";
import { createEmptyStats } from "./createEmptyStats.ts";
import { runConcurrently } from "./runConcurrently.ts";
import { isCmsEntryRow } from "./cmsEntryGuards.ts";

const DEFAULT_SEGMENT_CONCURRENCY = 4;
const DEFAULT_WRITE_CONCURRENCY = 8;
const LATEST_SK = "L";
const MD_ATTRIBUTE = "_md";

export interface ReadyGroup {
    kind: "ready";
    records: Map<string, LiveFieldReconciler.Record>;
}

export interface IgnoredGroup {
    kind: "ignored";
}

export interface SkippedGroup {
    kind: "skipped";
    reason: LiveFieldReconciler.SkipReason;
    detail?: string;
}

export type GroupPreparation = ReadyGroup | IgnoredGroup | SkippedGroup;

export interface AttributeWrite {
    path: string[];
    value: unknown;
}

interface SegmentRun {
    segment: number;
    totalSegments: number;
}

export abstract class BaseLiveFieldRunner implements LiveFieldRunner.Interface {
    protected abstract readonly table: LiveFieldReconciler.Table;

    protected constructor(
        protected readonly reconciler: LiveFieldReconciler.Interface,
        protected readonly logger: Logger.Interface
    ) {}

    protected abstract acceptsRow(row: DatabaseRecord): boolean;

    protected abstract prepareGroup(pk: string, rows: DatabaseRecord[]): Promise<GroupPreparation>;

    protected abstract buildWrite(
        change: LiveFieldReconciler.Change,
        record: LiveFieldReconciler.Record
    ): Promise<AttributeWrite>;

    public async run(options: LiveFieldRunner.Options): Promise<LiveFieldRunner.Stats> {
        const stats = createEmptyStats();
        const segments: SegmentRun[] = [];
        for (let segment = 0; segment < options.target.segments; segment++) {
            segments.push({ segment, totalSegments: options.target.segments });
        }
        const concurrency = options.target.concurrency ?? DEFAULT_SEGMENT_CONCURRENCY;

        await runConcurrently(segments, concurrency, run => this.runSegment(run, options, stats));

        options.onProgress(stats);
        return stats;
    }

    private async runSegment(
        run: SegmentRun,
        options: LiveFieldRunner.Options,
        stats: LiveFieldRunner.Stats
    ): Promise<void> {
        const { client, tableName } = options.target;
        const rows = client.scan<DatabaseRecord>(tableName, {
            segment: run.segment,
            totalSegments: run.totalSegments,
            sortKeyEquals: LATEST_SK
        });

        for await (const row of rows) {
            stats.scanned++;
            if (!isCmsEntryRow(row) || !this.acceptsRow(row)) {
                options.onProgress(stats);
                continue;
            }

            const groupRows = await client.queryAll<DatabaseRecord>(tableName, row.PK);
            const prepared = await this.prepareGroup(row.PK, groupRows);
            if (prepared.kind === "ignored") {
                options.onProgress(stats);
                continue;
            }

            stats.entries++;
            if (prepared.kind === "skipped") {
                this.recordSkip(options, stats, {
                    pk: row.PK,
                    sk: LATEST_SK,
                    reason: prepared.reason,
                    detail: prepared.detail
                });
                options.onProgress(stats);
                continue;
            }

            const decision = this.reconciler.decide({
                pk: row.PK,
                table: this.table,
                records: prepared.records
            });
            for (const skip of decision.skips) {
                this.recordSkip(options, stats, skip);
            }
            await this.applyChanges(decision.changes, prepared.records, options, stats);
            options.onProgress(stats);
        }

        this.logger.debug(
            `fix-live[${this.table}]: segment ${run.segment + 1}/${run.totalSegments} done — ${stats.scanned} rows scanned so far`
        );
    }

    private async applyChanges(
        changes: LiveFieldReconciler.Change[],
        records: Map<string, LiveFieldReconciler.Record>,
        options: LiveFieldRunner.Options,
        stats: LiveFieldRunner.Stats
    ): Promise<void> {
        for (const change of changes) {
            stats.changes[change.reason]++;
        }
        if (options.mode === "dry-run") {
            for (const change of changes) {
                options.report.change(this.toReportChange(change, "dry-run"));
            }
            return;
        }
        const writeConcurrency = options.target.writeConcurrency ?? DEFAULT_WRITE_CONCURRENCY;
        await runConcurrently(changes, writeConcurrency, change =>
            this.write(change, records, options, stats)
        );
    }

    private async write(
        change: LiveFieldReconciler.Change,
        records: Map<string, LiveFieldReconciler.Record>,
        options: LiveFieldRunner.Options,
        stats: LiveFieldRunner.Stats
    ): Promise<void> {
        const record = records.get(change.sk);
        if (!record) {
            throw new Error(
                `fix-live: decide() emitted a change for ${change.pk} ${change.sk}, which is not in the group`
            );
        }
        const { path, value } = await this.buildWrite(change, record);
        const result = await options.target.client.updateAttribute(options.target.tableName, {
            key: { PK: change.pk, SK: change.sk },
            path,
            value,
            condition: { attribute: MD_ATTRIBUTE, equals: change.expectedMd }
        });

        if (result === "written") {
            stats.written++;
            options.report.change(this.toReportChange(change, "written"));
            return;
        }
        stats.conditionFailed++;
        options.report.change(this.toReportChange(change, "condition-failed"));
        this.recordSkip(options, stats, {
            pk: change.pk,
            sk: change.sk,
            reason: "changed-during-run"
        });
    }

    private recordSkip(
        options: LiveFieldRunner.Options,
        stats: LiveFieldRunner.Stats,
        skip: LiveFieldReconciler.Skip
    ): void {
        stats.skips[skip.reason]++;
        options.report.skip({
            table: this.table,
            pk: skip.pk,
            sk: skip.sk,
            reason: skip.reason,
            detail: skip.detail
        });
    }

    private toReportChange(
        change: LiveFieldReconciler.Change,
        result: ChangeReport.Result
    ): ChangeReport.Change {
        return {
            table: this.table,
            pk: change.pk,
            sk: change.sk,
            reason: change.reason,
            before: change.before,
            after: change.after,
            result
        };
    }
}

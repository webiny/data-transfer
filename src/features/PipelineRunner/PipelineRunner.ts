import { type Abstraction, type Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.js";
import { Logger } from "~/tools/Logger/abstractions/Logger.js";
import { Commands } from "~/domain/transform/commands/Commands.js";
import type { Scanner } from "~/domain/pipeline/abstractions/Scanner.js";
import type { Processor } from "~/domain/pipeline/abstractions/Processor.js";
import type { Hook } from "~/domain/pipeline/abstractions/Hook.js";
import { Pipeline } from "~/domain/pipeline/Pipeline.js";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.js";
import { BaseTransformContextFactory } from "~/features/TransformContext/abstractions/BaseTransformContext.js";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.js";
import { SnapshotWriter } from "~/features/SnapshotWriter/abstractions/SnapshotWriter.js";
import { DroppedRecordLog } from "~/features/DroppedRecordLog/index.js";
import { TransferredRecordLog } from "~/features/TransferredRecordLog/index.js";
import { RecordDisposition } from "~/domain/pipeline/index.js";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.js";
import {
    PipelineRunner as PipelineRunnerAbstraction,
    type RunOptions,
    type RunStats
} from "./abstractions/PipelineRunner.ts";

export type { IPipelineRunner } from "./abstractions/PipelineRunner.js";

type ProcessorInstance = Processor.Interface<BaseTransformContext.Interface<unknown>, any>;

type AnyPipeline = Pipeline<any, any, any>;

interface RunShardParams {
    mergeGroupId: string;
    pipelines: AnyPipeline[];
    scanner: Scanner.Interface<unknown, unknown>;
    shard: unknown;
    pipelineProcessors: Map<AnyPipeline, ProcessorInstance[]>;
    shardCtx: Processor.AfterShardContext;
}

interface ShardStats {
    transferred: Map<string, number>;
    blackholed: Map<string, number>;
    unmatched: Map<string, number>;
}

class PipelineRunnerImpl implements PipelineRunnerAbstraction.Interface {
    private mergeGroups: Map<Scanner.Interface<unknown, unknown>, AnyPipeline[]> = new Map();

    private readonly registeredNames: Set<string> = new Set();

    private readonly unclaimedWarned: Set<string> = new Set();

    private lastShardStats: RunStats | null = null;

    public constructor(
        private readonly container: Container,
        private readonly config: MigrationConfig.Interface,
        private readonly logger: Logger.Interface,
        private readonly transferContext: TransferContext.Interface,
        private readonly baseContextFactory: BaseTransformContextFactory.Interface,
        private readonly snapshotWriter: SnapshotWriter.Interface,
        private readonly droppedLog: DroppedRecordLog.Interface,
        private readonly transferredLog: TransferredRecordLog.Interface
    ) {}

    public register(...pipelines: AnyPipeline[]): this {
        for (const pipeline of pipelines) {
            if (this.registeredNames.has(pipeline.name)) {
                throw new Error(
                    `PipelineRunner: pipeline name "${pipeline.name}" is already registered. ` +
                        `Names must be unique within a runner.`
                );
            }
            this.registeredNames.add(pipeline.name);

            const groupKey = pipeline.scanner;
            const group = this.mergeGroups.get(groupKey);
            if (group) {
                group.push(pipeline);
            } else {
                this.mergeGroups.set(groupKey, [pipeline]);
            }
        }

        return this;
    }

    public getShardStats(): RunStats | null {
        return this.lastShardStats;
    }

    public getProcessors(): ProcessorInstance[] {
        const seen: Set<ProcessorInstance> = new Set();
        const processors: ProcessorInstance[] = [];
        for (const pipelines of this.mergeGroups.values()) {
            for (const pipeline of pipelines) {
                for (const processor of pipeline.processors) {
                    if (!seen.has(processor)) {
                        seen.add(processor);
                        processors.push(processor);
                    }
                }
            }
        }
        return processors;
    }

    public async run(opts?: RunOptions): Promise<void> {
        try {
            await this.runInternal(opts);
        } finally {
            // Snapshot streams hold file descriptors — close in `finally`
            // so a thrown scanner/transformer doesn't leave them dangling.
            await this.snapshotWriter.close();
        }
    }

    private async runInternal(opts?: RunOptions): Promise<void> {
        if (!opts) {
            for (const [scanner, pipelines] of this.mergeGroups) {
                await this.runMergeGroup(scanner, pipelines);
            }
            return;
        }

        if (this.mergeGroups.size > 1) {
            throw new Error(
                `PipelineRunner.run({...}): shard mode is only supported with a single ` +
                    `merge group; got ${this.mergeGroups.size}.`
            );
        }

        const entry = this.mergeGroups.entries().next();
        if (entry.done) {
            return;
        }
        const [scanner, pipelines] = entry.value;
        await this.runSingleShard(scanner, pipelines, opts);
    }

    private async runSingleShard(
        scanner: Scanner.Interface<unknown, unknown>,
        pipelines: AnyPipeline[],
        opts: RunOptions
    ): Promise<void> {
        const shards = await scanner.listShards();

        if (shards.length !== opts.totalSegments) {
            throw new Error(
                `PipelineRunner.run({segment, totalSegments}): scanner "${this.deriveMergeGroupId(scanner)}" ` +
                    `reported ${shards.length} shards but caller declared ` +
                    `totalSegments=${opts.totalSegments}.`
            );
        }

        const mergeGroupId = this.deriveMergeGroupId(scanner);
        const pipelineProcessors = this.resolvePipelineProcessors(pipelines);
        const shard = shards[opts.segment];
        const stats = await this.runShard({
            mergeGroupId,
            pipelines,
            scanner,
            shard,
            pipelineProcessors,
            shardCtx: { segment: opts.segment, totalSegments: opts.totalSegments }
        });
        this.lastShardStats = {
            mergeGroupId,
            transferred: Object.fromEntries(stats.transferred),
            blackholed: Object.fromEntries(stats.blackholed),
            unmatched: Object.fromEntries(stats.unmatched)
        };
    }

    private async runMergeGroup(
        scanner: Scanner.Interface<unknown, unknown>,
        pipelines: AnyPipeline[]
    ): Promise<void> {
        const mergeGroupId = this.deriveMergeGroupId(scanner);
        const hookParams: Hook.RunParams = {
            runId: this.transferContext.runId,
            mergeGroupId
        };

        const beforeHookTokens = this.dedupHookTokens(pipelines, "before");
        for (const hookToken of beforeHookTokens) {
            const hook = this.container.resolve(hookToken);
            await hook.run(hookParams);
        }

        const pipelineProcessors = this.resolvePipelineProcessors(pipelines);

        const shards = await scanner.listShards();
        const allStats: ShardStats[] = [];
        for (let i = 0; i < shards.length; i++) {
            const stats = await this.runShard({
                mergeGroupId,
                pipelines,
                scanner,
                shard: shards[i],
                pipelineProcessors,
                shardCtx: { segment: i, totalSegments: shards.length }
            });
            allStats.push(stats);
        }

        this.logRunSummary(mergeGroupId, allStats);

        const afterHookTokens = this.dedupHookTokens(pipelines, "after");
        for (let i = afterHookTokens.length - 1; i >= 0; i--) {
            const hookToken = afterHookTokens[i]!;
            const hook = this.container.resolve(hookToken);
            await hook.run(hookParams);
        }
    }

    private resolvePipelineProcessors(
        pipelines: AnyPipeline[]
    ): Map<AnyPipeline, ProcessorInstance[]> {
        const result: Map<AnyPipeline, ProcessorInstance[]> = new Map();
        for (const pipeline of pipelines) {
            result.set(pipeline, [...pipeline.processors]);
        }
        return result;
    }

    private dedupHookTokens(
        pipelines: AnyPipeline[],
        lifecycle: "before" | "after"
    ): Abstraction<Hook.Interface>[] {
        const seen: Set<Abstraction<Hook.Interface>> = new Set();
        const result: Abstraction<Hook.Interface>[] = [];
        for (const pipeline of pipelines) {
            const tokens =
                lifecycle === "before" ? pipeline.beforeHookTokens : pipeline.afterHookTokens;
            for (const token of tokens) {
                if (!seen.has(token)) {
                    seen.add(token);
                    result.push(token);
                }
            }
        }
        return result;
    }

    private async runShard(params: RunShardParams): Promise<ShardStats> {
        const { mergeGroupId, pipelines, scanner, shard, pipelineProcessors, shardCtx } = params;

        const flushEvery = this.config.tuning?.flushEvery ?? 500;
        const processorOrder = this.collectProcessorOrder(pipelines, pipelineProcessors);
        let pendingCommands = new Commands();
        let recordCount = 0;
        let periodicFlushCount = 0;

        const perPipelineTransferred: Map<string, number> = new Map();
        const perPipelineBlackholed: Map<string, number> = new Map();
        const unmatchedByType: Map<string, number> = new Map();

        for await (const record of scanner.scan(shard)) {
            let matched = false;
            for (const pipeline of pipelines) {
                if (!(await pipeline.accepts(record))) {
                    continue;
                }
                matched = true;
                const processors = pipelineProcessors.get(pipeline)!;
                await this.snapshotWriter.write(
                    `${pipeline.name}/segment-${shardCtx.segment}.source.jsonl`,
                    record
                );
                const result = await this.runRecord(
                    pipeline,
                    processors,
                    record,
                    pendingCommands,
                    shardCtx
                );
                if (result instanceof RecordDisposition.Blackholed) {
                    this.droppedLog.add(record, result);
                    perPipelineBlackholed.set(
                        pipeline.name,
                        (perPipelineBlackholed.get(pipeline.name) ?? 0) + 1
                    );
                } else {
                    perPipelineTransferred.set(
                        pipeline.name,
                        (perPipelineTransferred.get(pipeline.name) ?? 0) + 1
                    );
                    this.transferredLog.add(record, pipeline.name);
                }
                break;
            }
            if (!matched) {
                const { PK, SK, TYPE } = record as any;
                const typeKey: string = TYPE && TYPE !== "unknown" ? TYPE : `${PK}:${SK}`;
                unmatchedByType.set(typeKey, (unmatchedByType.get(typeKey) ?? 0) + 1);
                this.logger.warn(`unmatched record — TYPE=${typeKey} PK=${PK} SK=${SK}`);
                await this.snapshotWriter.write(
                    `dropped/segment-${shardCtx.segment}.jsonl`,
                    record
                );
                this.droppedLog.add(record, new RecordDisposition.Unmatched());
            }

            recordCount++;
            if (recordCount % flushEvery === 0) {
                await this.flushShard(pendingCommands, processorOrder);
                pendingCommands = new Commands();
                periodicFlushCount++;
            }
        }

        this.logShardSummary(
            mergeGroupId,
            shardCtx,
            perPipelineTransferred,
            perPipelineBlackholed,
            unmatchedByType
        );

        if (pendingCommands.size() > 0 || periodicFlushCount === 0) {
            await this.flushShard(pendingCommands, processorOrder);
        }

        for (const processor of processorOrder) {
            if (!processor.afterShard) {
                continue;
            }
            await processor.afterShard(shardCtx);
        }

        this.droppedLog.flush(shardCtx.segment);
        this.transferredLog.flush(shardCtx.segment);

        return {
            transferred: perPipelineTransferred,
            blackholed: perPipelineBlackholed,
            unmatched: unmatchedByType
        };
    }

    private async flushShard(commands: Commands, processors: ProcessorInstance[]): Promise<void> {
        for (const processor of processors) {
            await processor.execute(commands);
        }
        this.warnUnclaimedKeys(commands);
    }

    private async runRecord(
        pipeline: AnyPipeline,
        processors: ProcessorInstance[],
        record: unknown,
        shardCommands: Commands,
        shardCtx: Processor.AfterShardContext
    ): Promise<RecordDisposition.Processed | RecordDisposition.Blackholed> {
        // Build the base ctx + its per-record commands bag via the shared
        // factory. Slice helpers close over this bag via ctx.addCommand.
        const { ctx, commands } = this.baseContextFactory.create<unknown>({ record });

        // Merge each processor's slice ONTO the base ctx (by reference,
        // not a spread copy). `ctx.replace(newRecord)` closes over this
        // same ctx — if transformers received a spread copy instead, the
        // replace would update the base ctx but the copy's .record would
        // still point at the pre-replace record. Mutating ctx keeps one
        // shared object across transformers, onEnd, and replace().
        // Slice-key collisions are a compile-time error via DisjointKeys.
        // TODO this stinks. couldnt we cache processor contexts or something like that for each pipeline?
        // TODO this runs so much times, and i wonder if its necessary
        for (const processor of processors) {
            if (!processor.extendContext) {
                continue;
            }
            Object.assign(ctx, processor.extendContext(ctx));
        }

        for (const transformer of pipeline.transformerFns) {
            await transformer(ctx as never);
        }

        // Per-record terminal hooks: run each processor's onEnd in array
        // order. onEnd uses slice helpers to push terminal commands into
        // the same per-record bag.
        for (const processor of processors) {
            if (!processor.onEnd) {
                continue;
            }
            await processor.onEnd(ctx as never);
        }

        // Snapshot: post-transform record + every command this record
        // emitted (the auto-put PutRecord, any extra copyFile / custom
        // addCommand calls). Both no-op when snapshot is disabled.
        await this.snapshotWriter.write(
            `${pipeline.name}/segment-${shardCtx.segment}.post-transform.jsonl`,
            ctx.record
        );
        for (const cmd of commands.all()) {
            await this.snapshotWriter.write(
                `${pipeline.name}/segment-${shardCtx.segment}.commands.jsonl`,
                cmd
            );
        }

        // Blackhole: drop every command this record emitted instead of
        // folding it into the shard buffer. Filters + transformers + onEnd
        // still ran (useful side effects stay intact) — only the write
        // path is suppressed. Snapshot above still recorded the commands,
        // so users can diff "what would have been written".
        if (pipeline.isBlackhole || ctx.isBlackholed) {
            return new RecordDisposition.Blackholed(pipeline.name);
        }

        // Fold this record's commands into the single shared shard buffer.
        // Each processor.execute will .get(key) from this shared buffer at
        // shard end, which marks that key as claimed. Any key nobody claims
        // surfaces via shardCommands.unclaimedKeys().
        for (const cmd of commands.all()) {
            shardCommands.add(cmd);
        }
        return new RecordDisposition.Processed();
    }

    private collectProcessorOrder(
        pipelines: AnyPipeline[],
        pipelineProcessors: Map<AnyPipeline, ProcessorInstance[]>
    ): ProcessorInstance[] {
        const seen: Set<ProcessorInstance> = new Set();
        const ordered: ProcessorInstance[] = [];
        for (const pipeline of pipelines) {
            const processors = pipelineProcessors.get(pipeline);
            if (!processors) {
                continue;
            }
            for (const processor of processors) {
                if (!seen.has(processor)) {
                    seen.add(processor);
                    ordered.push(processor);
                }
            }
        }
        return ordered;
    }

    private logShardSummary(
        mergeGroupId: string,
        shardCtx: Processor.AfterShardContext,
        transferred: Map<string, number>,
        blackholed: Map<string, number>,
        unmatched: Map<string, number>
    ): void {
        const transferredTotal = sumMap(transferred);
        const blackholedTotal = sumMap(blackholed);
        const unmatchedTotal = sumMap(unmatched);
        const scannedTotal = transferredTotal + blackholedTotal + unmatchedTotal;
        const parts: string[] = [
            `scanned ${scannedTotal}`,
            `transferred ${transferredTotal}${formatDetail(transferred)}`,
            `blackholed ${blackholedTotal}${formatDetail(blackholed)}`,
            `unmatched ${unmatchedTotal}${formatDetail(unmatched)}`
        ];
        this.logger.info(
            `[${mergeGroupId} shard ${shardCtx.segment + 1}/${shardCtx.totalSegments}] ` +
                parts.join(", ")
        );
    }

    private logRunSummary(mergeGroupId: string, stats: ShardStats[]): void {
        const transferred: Map<string, number> = new Map();
        const blackholed: Map<string, number> = new Map();
        const unmatched: Map<string, number> = new Map();

        for (const s of stats) {
            for (const [name, count] of s.transferred) {
                transferred.set(name, (transferred.get(name) ?? 0) + count);
            }
            for (const [name, count] of s.blackholed) {
                blackholed.set(name, (blackholed.get(name) ?? 0) + count);
            }
            for (const [type, count] of s.unmatched) {
                unmatched.set(type, (unmatched.get(type) ?? 0) + count);
            }
        }

        const transferredTotal = sumMap(transferred);
        const blackholedTotal = sumMap(blackholed);
        const unmatchedTotal = sumMap(unmatched);
        const scannedTotal = transferredTotal + blackholedTotal + unmatchedTotal;
        const parts: string[] = [
            `scanned ${scannedTotal}`,
            `transferred ${transferredTotal}${formatDetail(transferred)}`,
            `blackholed ${blackholedTotal}${formatDetail(blackholed)}`,
            `unmatched ${unmatchedTotal}${formatDetail(unmatched)}`
        ];
        this.logger.info(`[${mergeGroupId}] TOTAL: ${parts.join(", ")}`);
    }

    /**
     * Emit a one-time warning per unclaimed command key observed across the
     * runner's lifetime. `unclaimedWarned` grows monotonically but is bounded
     * by the number of distinct command keys ever emitted (tiny in practice —
     * PutRecord, S3Copy, and whatever future processors introduce).
     */
    private warnUnclaimedKeys(buffer: Commands): void {
        const unclaimed = buffer.unclaimedKeys();
        if (unclaimed.length === 0) {
            return;
        }
        for (const key of unclaimed) {
            if (this.unclaimedWarned.has(key)) {
                continue;
            }
            this.unclaimedWarned.add(key);
            this.logger.warn(
                `PipelineRunner: command key "${key}" was emitted but no processor claimed it. ` +
                    `(warn-once per runner)`
            );
        }
    }

    private deriveMergeGroupId(scanner: Scanner.Interface<unknown, unknown>): string {
        return scanner.constructor.name.replace("Impl", "");
    }
}

function sumMap(map: Map<string, number>): number {
    let total = 0;
    for (const count of map.values()) {
        total += count;
    }
    return total;
}

function formatDetail(map: Map<string, number>): string {
    if (map.size === 0) {
        return "";
    }
    const parts = Array.from(map.entries())
        .map(([name, count]) => `${name}=${count}`)
        .join(", ");
    return ` (${parts})`;
}

export const PipelineRunner = PipelineRunnerAbstraction.createImplementation({
    implementation: PipelineRunnerImpl,
    dependencies: [
        ContainerToken,
        MigrationConfig,
        Logger,
        TransferContext,
        BaseTransformContextFactory,
        SnapshotWriter,
        DroppedRecordLog,
        TransferredRecordLog
    ]
});

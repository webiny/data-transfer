import { type Abstraction, type Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import type { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import type { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import type { Hook } from "~/domain/pipeline/abstractions/Hook.ts";
import { Pipeline } from "~/domain/pipeline/Pipeline.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { BaseTransformContextFactory } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import {
    PipelineRunner as PipelineRunnerAbstraction,
    type RunOptions
} from "./abstractions/PipelineRunner.ts";

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

class PipelineRunnerImpl implements PipelineRunnerAbstraction.Interface {
    private mergeGroups: Map<Abstraction<Scanner.Interface<unknown, unknown>>, AnyPipeline[]> =
        new Map();

    private readonly registeredNames: Set<string> = new Set();

    private readonly unclaimedWarned: Set<string> = new Set();

    public constructor(
        private readonly container: Container,
        private readonly logger: Logger.Interface,
        private readonly transferContext: TransferContext.Interface,
        private readonly baseContextFactory: BaseTransformContextFactory.Interface
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

            const groupKey = pipeline.scannerToken as Abstraction<
                Scanner.Interface<unknown, unknown>
            >;
            const group = this.mergeGroups.get(groupKey);
            if (group) {
                group.push(pipeline);
            } else {
                this.mergeGroups.set(groupKey, [pipeline]);
            }
        }

        return this;
    }

    public getProcessors(): ProcessorInstance[] {
        const seen: Set<ProcessorInstance> = new Set();
        const processors: ProcessorInstance[] = [];
        for (const pipelines of this.mergeGroups.values()) {
            for (const pipeline of pipelines) {
                for (const token of pipeline.processorTokens) {
                    const processor = this.container.resolve(token) as ProcessorInstance;
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
        if (!opts) {
            for (const [scannerToken, pipelines] of this.mergeGroups) {
                await this.runMergeGroup(scannerToken, pipelines);
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
        const [scannerToken, pipelines] = entry.value;
        await this.runSingleShard(scannerToken, pipelines, opts);
    }

    private async runSingleShard(
        scannerToken: Abstraction<Scanner.Interface<unknown, unknown>>,
        pipelines: AnyPipeline[],
        opts: RunOptions
    ): Promise<void> {
        const scanner = this.container.resolve(scannerToken);
        const shards = await scanner.listShards();

        if (shards.length !== opts.totalSegments) {
            throw new Error(
                `PipelineRunner.run({segment, totalSegments}): scanner "${scannerToken.toString()}" ` +
                    `reported ${shards.length} shards but caller declared ` +
                    `totalSegments=${opts.totalSegments}.`
            );
        }

        const mergeGroupId = this.deriveMergeGroupId(scannerToken);
        const pipelineProcessors = this.resolvePipelineProcessors(pipelines);
        const shard = shards[opts.segment];
        await this.runShard({
            mergeGroupId,
            pipelines,
            scanner,
            shard,
            pipelineProcessors,
            shardCtx: { segment: opts.segment, totalSegments: opts.totalSegments }
        });
    }

    private async runMergeGroup(
        scannerToken: Abstraction<Scanner.Interface<unknown, unknown>>,
        pipelines: AnyPipeline[]
    ): Promise<void> {
        const scanner = this.container.resolve(scannerToken);
        const mergeGroupId = this.deriveMergeGroupId(scannerToken);
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
        for (let i = 0; i < shards.length; i++) {
            await this.runShard({
                mergeGroupId,
                pipelines,
                scanner,
                shard: shards[i],
                pipelineProcessors,
                shardCtx: { segment: i, totalSegments: shards.length }
            });
        }

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
            const instances: ProcessorInstance[] = [];
            for (const token of pipeline.processorTokens) {
                instances.push(this.container.resolve(token) as ProcessorInstance);
            }
            result.set(pipeline, instances);
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

    private async runShard(params: RunShardParams): Promise<void> {
        const { mergeGroupId, pipelines, scanner, shard, pipelineProcessors, shardCtx } = params;
        // Single shared command buffer for the whole shard. Per-record
        // transformers + processor.onEnd hooks push into it via slice
        // helpers / addCommand. At shard end, each processor.execute drains
        // its own keys via commands.get(key) — which also marks them claimed.
        // After all processors drain, commands.unclaimedKeys() reports any
        // keys that nobody handled (transformer pushed X but pipeline lacks
        // the processor that drains X).
        const shardCommands = new Commands();

        // Track per-shard dispatch counts — aggregate at shard end instead
        // of per-record so a real prod run surfaces silent drops (records
        // matching no pipeline filter) in the default `info` log instead
        // of being invisible at `debug`.
        let droppedCount = 0;
        const perPipelineCounts: Map<string, number> = new Map();

        for await (const record of scanner.scan(shard)) {
            let matched = false;
            for (const pipeline of pipelines) {
                if (!pipeline.accepts(record)) {
                    continue;
                }
                matched = true;
                const processors = pipelineProcessors.get(pipeline)!;
                perPipelineCounts.set(
                    pipeline.name,
                    (perPipelineCounts.get(pipeline.name) ?? 0) + 1
                );
                await this.runRecord(pipeline, processors, record, shardCommands);
                // First-match-wins: subsequent pipelines in this group are
                // skipped for this record. Pipeline registration order
                // determines priority.
                break;
            }
            if (!matched) {
                droppedCount++;
                this.logger.debug(
                    "record dropped: no matching pipeline in merge group",
                    mergeGroupId
                );
            }
        }

        this.logShardSummary(mergeGroupId, shardCtx, perPipelineCounts, droppedCount);

        // Shard end: each unique processor (across pipelines in this group)
        // drains the shared buffer in first-seen registration order.
        const processorOrder = this.collectProcessorOrder(pipelines, pipelineProcessors);
        for (const processor of processorOrder) {
            await processor.execute(shardCommands);
        }

        // Per-shard terminal hooks: each processor persists its own
        // cross-boundary state (e.g., OsProcessor writes touchedIndexes).
        // Sequential, processor array order — same as execute().
        for (const processor of processorOrder) {
            if (!processor.afterShard) {
                continue;
            }
            await processor.afterShard(shardCtx);
        }

        this.warnUnclaimedKeys(shardCommands);
    }

    private async runRecord(
        pipeline: AnyPipeline,
        processors: ProcessorInstance[],
        record: unknown,
        shardCommands: Commands
    ): Promise<void> {
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

        // Fold this record's commands into the single shared shard buffer.
        // Each processor.execute will .get(key) from this shared buffer at
        // shard end, which marks that key as claimed. Any key nobody claims
        // surfaces via shardCommands.unclaimedKeys().
        for (const cmd of commands.all()) {
            shardCommands.add(cmd);
        }
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
        perPipelineCounts: Map<string, number>,
        droppedCount: number
    ): void {
        let transferredTotal = 0;
        for (const count of perPipelineCounts.values()) {
            transferredTotal += count;
        }
        const scannedTotal = transferredTotal + droppedCount;
        const perPipeline = Array.from(perPipelineCounts.entries())
            .map(([name, count]) => `${name}=${count}`)
            .join(", ");
        const detail = perPipeline.length > 0 ? ` (${perPipeline})` : "";
        this.logger.info(
            `[${mergeGroupId} shard ${shardCtx.segment + 1}/${shardCtx.totalSegments}] ` +
                `scanned ${scannedTotal}, transferred ${transferredTotal}${detail}, dropped ${droppedCount}`
        );
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

    private deriveMergeGroupId(scannerToken: Abstraction<unknown>): string {
        return scannerToken.toString().replace(/\//g, "-");
    }
}

export const PipelineRunner = PipelineRunnerAbstraction.createImplementation({
    implementation: PipelineRunnerImpl,
    dependencies: [ContainerToken, Logger, TransferContext, BaseTransformContextFactory]
});

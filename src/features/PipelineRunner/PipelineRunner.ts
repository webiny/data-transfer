import { Metadata, type Abstraction, type Constructor, type Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import type { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import type { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import type { Hook } from "~/domain/pipeline/abstractions/Hook.ts";
import { Pipeline } from "~/domain/pipeline/Pipeline.ts";
import { PipelineBuilder } from "~/domain/pipeline/PipelineBuilder.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { BaseTransformContextFactory } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import {
    PipelineRunner as PipelineRunnerAbstraction,
    type RunOptions
} from "./abstractions/PipelineRunner.ts";

type AnyImpl = Constructor<unknown> & { __abstraction: Abstraction<unknown> };

type ProcessorToken = Abstraction<
    Processor.Interface<BaseTransformContext.Interface<unknown>, any>
>;

type ProcessorInstance = Processor.Interface<BaseTransformContext.Interface<unknown>, any>;

type AnyPipeline = Pipeline<any, any, any>;

type PipelineMethod = PipelineRunnerAbstraction.Interface["pipeline"];

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

    public pipeline: PipelineMethod = ((input: {
        name: string;
        scanner: AnyImpl;
        processors: readonly AnyImpl[];
    }) => {
        const scannerAbstraction = new Metadata(input.scanner).getAbstraction() as Abstraction<
            Scanner.Interface<unknown, unknown>
        >;
        const processorAbstractions = input.processors.map(
            p => new Metadata(p).getAbstraction() as ProcessorToken
        );
        // The public interface narrows this via IPipelineRunner.pipeline; the
        // implementation is intentionally widened.
        return new PipelineBuilder({
            name: input.name,
            scanner: scannerAbstraction,
            processors: processorAbstractions
        });
    }) as unknown as PipelineMethod;

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
        await this.runShard(mergeGroupId, pipelines, scanner, shard, pipelineProcessors);
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
        for (const shard of shards) {
            await this.runShard(mergeGroupId, pipelines, scanner, shard, pipelineProcessors);
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

    private async runShard(
        mergeGroupId: string,
        pipelines: AnyPipeline[],
        scanner: Scanner.Interface<unknown, unknown>,
        shard: unknown,
        pipelineProcessors: Map<AnyPipeline, ProcessorInstance[]>
    ): Promise<void> {
        // Per-processor command buffer, accumulated across every record in the
        // shard and drained once at shard end via processor.execute(buffer).
        const processorBuffers: Map<ProcessorInstance, Commands> = new Map();

        for await (const record of scanner.scan(shard)) {
            let matched = false;
            for (const pipeline of pipelines) {
                if (!pipeline.accepts(record)) {
                    continue;
                }
                matched = true;
                const processors = pipelineProcessors.get(pipeline)!;
                await this.runRecord(pipeline, processors, record, processorBuffers);
                // First-match-wins: subsequent pipelines in this group are
                // skipped for this record. Pipeline registration order
                // determines priority.
                break;
            }
            if (!matched) {
                this.logger.debug(
                    "record dropped: no matching pipeline in merge group",
                    mergeGroupId
                );
            }
        }

        // Shard end: each processor drains its buffer in array order. We
        // iterate each unique processor (across pipelines in this group) in
        // first-seen registration order so execution is deterministic.
        const processorOrder = this.collectProcessorOrder(pipelines, pipelineProcessors);
        for (const processor of processorOrder) {
            const buffer = processorBuffers.get(processor);
            if (!buffer) {
                continue;
            }
            await processor.execute(buffer);
            this.warnUnclaimedKeys(buffer);
        }
    }

    private async runRecord(
        pipeline: AnyPipeline,
        processors: ProcessorInstance[],
        record: unknown,
        processorBuffers: Map<ProcessorInstance, Commands>
    ): Promise<void> {
        // Build the base ctx + its commands bag via the shared factory. The
        // commands bag returned here is wired into ctx.addCommand and every
        // slice helper that pushes commands.
        const { ctx, commands } = this.baseContextFactory.create<unknown>({ record });

        // Spread each processor's slice over ctx in array order. Later
        // processors may override earlier keys — type-level DisjointKeys
        // makes that a compile error, but at runtime we just spread.
        let merged: Record<string, unknown> = ctx as unknown as Record<string, unknown>;
        for (const processor of processors) {
            if (processor.extendContext) {
                const slice = processor.extendContext(
                    merged as unknown as BaseTransformContext.Interface<unknown>
                );
                merged = { ...merged, ...(slice as Record<string, unknown>) };
            }
        }

        const effective = merged as unknown as BaseTransformContext.Interface<unknown> & object;

        for (const transformer of pipeline.transformerFns) {
            await transformer(effective as never);
        }

        // Per-record terminal hooks: run each processor's onEnd in array
        // order. onEnd uses slice helpers to push terminal commands into
        // the same commands bag.
        for (const processor of processors) {
            if (processor.onEnd) {
                await processor.onEnd(effective);
            }
        }

        // Fold this record's commands into the per-processor shard buffer.
        // All processors share the single commands bag at this point — we
        // flatten and assign every command to every processor's buffer so
        // each processor can claim the keys it owns via .get().
        //
        // NOTE: .get() marks keys as "claimed" on the buffer it was called
        // on, so feeding each buffer a separate Commands instance keeps
        // unclaimed-tracking per-processor (a key unclaimed by Processor A
        // may still be owned by Processor B).
        for (const processor of processors) {
            let buffer = processorBuffers.get(processor);
            if (!buffer) {
                buffer = new Commands();
                processorBuffers.set(processor, buffer);
            }
            for (const cmd of commands.all()) {
                buffer.add(cmd);
            }
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

import type { Container, Abstraction } from "@webiny/di";
import { ContainerToken } from "~/base/index.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import type { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import type { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import type { Hook } from "~/domain/pipeline/abstractions/Hook.ts";
import { Pipeline } from "~/domain/pipeline/Pipeline.ts";
import { PipelineBuilder } from "~/domain/pipeline/PipelineBuilder.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import {
    PipelineRunner as PipelineRunnerAbstraction,
    type PipelineRunnerFactoryInput
} from "./abstractions/PipelineRunner.ts";

interface AutoPutContext {
    record: Record<string, unknown>;
    putRecord(record: Record<string, unknown>): void;
}

class PipelineRunnerImpl implements PipelineRunnerAbstraction.Interface {
    private mergeGroups: Map<
        Abstraction<Scanner.Interface<unknown, unknown>>,
        Pipeline<unknown, Processor.Context, unknown>[]
    > = new Map();

    private pipelineNames: Set<string> = new Set();

    public constructor(
        private readonly container: Container,
        private readonly logger: Logger.Interface,
        private readonly transferContext: TransferContext.Interface
    ) {}

    public pipeline<TRecord, TContext extends Processor.Context, TShard>(
        config: PipelineRunnerFactoryInput<TRecord, TContext, TShard>
    ): PipelineBuilder<TRecord, TContext, TShard> {
        return new PipelineBuilder<TRecord, TContext, TShard>({
            name: config.name,
            scanner: config.scanner,
            processor: config.processor
        });
    }

    public register<TRecord, TContext extends Processor.Context, TShard>(
        pipeline: Pipeline<TRecord, TContext, TShard>
    ): this {
        if (this.pipelineNames.has(pipeline.name)) {
            throw new Error(`PipelineRunner: pipeline name "${pipeline.name}" already registered`);
        }
        this.pipelineNames.add(pipeline.name);

        const erased = pipeline as unknown as Pipeline<unknown, Processor.Context, unknown>;
        const groupKey = erased.scannerToken as Abstraction<Scanner.Interface<unknown, unknown>>;
        const group = this.mergeGroups.get(groupKey);
        if (group) {
            group.push(erased);
        } else {
            this.mergeGroups.set(groupKey, [erased]);
        }

        return this;
    }

    public async run(): Promise<void> {
        for (const [scannerToken, pipelines] of this.mergeGroups) {
            await this.runMergeGroup(scannerToken, pipelines);
        }
    }

    private async runMergeGroup(
        scannerToken: Abstraction<Scanner.Interface<unknown, unknown>>,
        pipelines: Pipeline<unknown, Processor.Context, unknown>[]
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

        const pipelineToProcessor: Map<
            Pipeline<unknown, Processor.Context, unknown>,
            Processor.Interface<unknown, Processor.Context>
        > = new Map();
        for (const pipeline of pipelines) {
            pipelineToProcessor.set(pipeline, this.container.resolve(pipeline.processorToken));
        }

        const shards = await scanner.listShards();
        for (const shard of shards) {
            await this.runShard(mergeGroupId, pipelines, scanner, shard, pipelineToProcessor);
        }

        const afterHookTokens = this.dedupHookTokens(pipelines, "after");
        for (let i = afterHookTokens.length - 1; i >= 0; i--) {
            const hookToken = afterHookTokens[i]!;
            const hook = this.container.resolve(hookToken);
            await hook.run(hookParams);
        }
    }

    private dedupHookTokens(
        pipelines: Pipeline<unknown, Processor.Context, unknown>[],
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
        pipelines: Pipeline<unknown, Processor.Context, unknown>[],
        scanner: Scanner.Interface<unknown, unknown>,
        shard: unknown,
        pipelineToProcessor: Map<
            Pipeline<unknown, Processor.Context, unknown>,
            Processor.Interface<unknown, Processor.Context>
        >
    ): Promise<void> {
        const processorBuffers: Map<
            Processor.Interface<unknown, Processor.Context>,
            Commands
        > = new Map();

        for await (const record of scanner.scan(shard)) {
            let matched = false;
            for (const pipeline of pipelines) {
                if (!pipeline.accepts(record)) {
                    continue;
                }
                matched = true;
                const processor = pipelineToProcessor.get(pipeline)!;
                const ctx = processor.createContext(record);
                for (const transformer of pipeline.transformerFns) {
                    await transformer(ctx);
                }
                // Auto-put: match legacy TransformPipeline which ended with an implicit
                // ctx.putRecord(ctx.record). Without this, mutation-only transformers write nothing.
                const autoPutCtx = ctx as unknown as AutoPutContext;
                autoPutCtx.putRecord(autoPutCtx.record);
                let buffer = processorBuffers.get(processor);
                if (!buffer) {
                    buffer = new Commands();
                    processorBuffers.set(processor, buffer);
                }
                for (const cmd of ctx.commands.all()) {
                    buffer.add(cmd);
                }
                // First-match-wins: subsequent pipelines in this group are skipped
                // for this record. Pipeline registration order determines priority.
                break;
            }
            if (!matched) {
                this.logger.debug(
                    "record dropped: no matching pipeline in merge group",
                    mergeGroupId
                );
            }
        }

        for (const [processor, buffer] of processorBuffers) {
            if (buffer.size() > 0) {
                await processor.execute(buffer);
            }
        }
    }

    private deriveMergeGroupId(scannerToken: Abstraction<unknown>): string {
        return scannerToken.toString().replace(/\//g, "-");
    }
}

export const PipelineRunner = PipelineRunnerAbstraction.createImplementation({
    implementation: PipelineRunnerImpl,
    dependencies: [ContainerToken, Logger, TransferContext]
});

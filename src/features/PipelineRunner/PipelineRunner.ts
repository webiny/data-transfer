import type { Container, Abstraction } from "@webiny/di";
import { ContainerToken } from "~/base/index.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import type { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import type { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { Pipeline } from "~/domain/pipeline/Pipeline.ts";
import { PipelineBuilder } from "~/domain/pipeline/PipelineBuilder.ts";
import {
    PipelineRunner as PipelineRunnerAbstraction,
    type PipelineRunnerFactoryInput
} from "./abstractions/PipelineRunner.ts";

interface ITransformer<TContext> {
    transform(ctx: TContext): void | Promise<void>;
}

class PipelineRunnerImpl implements PipelineRunnerAbstraction.Interface {
    private mergeGroups: Map<
        Abstraction<Scanner.Interface<unknown, unknown>>,
        Pipeline<unknown, Processor.Context, unknown>[]
    > = new Map();

    private pipelineNames: Set<string> = new Set();

    public constructor(
        private readonly container: Container,
        private readonly logger: Logger.Interface
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

    public register(pipeline: Pipeline<unknown, Processor.Context, unknown>): this {
        if (this.pipelineNames.has(pipeline.name)) {
            throw new Error(`PipelineRunner: pipeline name "${pipeline.name}" already registered`);
        }
        this.pipelineNames.add(pipeline.name);

        const groupKey = pipeline.scannerToken as Abstraction<Scanner.Interface<unknown, unknown>>;
        const group = this.mergeGroups.get(groupKey);
        if (group) {
            group.push(pipeline);
        } else {
            this.mergeGroups.set(groupKey, [pipeline]);
        }

        const mergeGroupId = this.deriveMergeGroupId(groupKey);
        for (const hookToken of pipeline.beforeHookTokens) {
            this.logger.debug(
                "hook registered but not invoked in this runner version",
                hookToken.toString(),
                "before",
                pipeline.name,
                mergeGroupId
            );
        }
        for (const hookToken of pipeline.afterHookTokens) {
            this.logger.debug(
                "hook registered but not invoked in this runner version",
                hookToken.toString(),
                "after",
                pipeline.name,
                mergeGroupId
            );
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
                for (const token of pipeline.transformerTokens) {
                    const transformer = this.container.resolve(
                        token as Abstraction<ITransformer<Processor.Context>>
                    );
                    await transformer.transform(ctx);
                }
                let buffer = processorBuffers.get(processor);
                if (!buffer) {
                    buffer = new Commands();
                    processorBuffers.set(processor, buffer);
                }
                for (const cmd of ctx.commands.all()) {
                    buffer.add(cmd);
                }
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
    dependencies: [ContainerToken, Logger]
});

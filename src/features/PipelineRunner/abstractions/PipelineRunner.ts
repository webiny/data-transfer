import type { Abstraction } from "@webiny/di";
import { createAbstraction } from "~/base/index.ts";
import type { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import type { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import type { Pipeline } from "~/domain/pipeline/Pipeline.ts";
import type { PipelineBuilder } from "~/domain/pipeline/PipelineBuilder.ts";

export interface PipelineRunnerFactoryInput<TRecord, TContext extends Processor.Context, TShard> {
    name: string;
    scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    processor: Abstraction<Processor.Interface<TRecord, TContext>>;
}

interface IPipelineRunner {
    pipeline<TRecord, TContext extends Processor.Context, TShard>(
        config: PipelineRunnerFactoryInput<TRecord, TContext, TShard>
    ): PipelineBuilder<TRecord, TContext, TShard>;

    register<TRecord, TContext extends Processor.Context, TShard>(
        pipeline: Pipeline<TRecord, TContext, TShard>
    ): this;

    run(): Promise<void>;
}

export const PipelineRunner = createAbstraction<IPipelineRunner>("Core/PipelineRunner");

export namespace PipelineRunner {
    export type Interface = IPipelineRunner;
    export type FactoryInput<
        TRecord,
        TContext extends Processor.Context,
        TShard
    > = PipelineRunnerFactoryInput<TRecord, TContext, TShard>;
}

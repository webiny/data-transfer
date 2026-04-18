import type { Abstraction } from "@webiny/di";
import type { Scanner } from "./abstractions/Scanner.ts";
import type { Processor } from "./abstractions/Processor.ts";
import type { PipelineBuilder } from "./PipelineBuilder.ts";
import type { PipelineRunner } from "~/features/PipelineRunner/index.ts";

export interface PipelineDefinition<TRecord, TContext extends Processor.Context, TShard> {
    readonly name: string;
    register(
        runner: PipelineRunner.Interface,
        scanner: Abstraction<Scanner.Interface<TRecord, TShard>>,
        processor: Abstraction<Processor.Interface<TRecord, TContext>>
    ): void;
}

export function createPipeline<TRecord, TContext extends Processor.Context, TShard>(
    name: string,
    configure: (builder: PipelineBuilder<TRecord, TContext, TShard>) => void
): PipelineDefinition<TRecord, TContext, TShard> {
    return {
        name,
        register(runner, scanner, processor) {
            const builder = runner.pipeline<TRecord, TContext, TShard>({
                name,
                scanner,
                processor
            });
            configure(builder);
            runner.register(builder.build());
        }
    };
}

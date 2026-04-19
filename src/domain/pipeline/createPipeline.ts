import { Abstraction, Metadata } from "@webiny/di";
import type { Scanner } from "./abstractions/Scanner.ts";
import type { Processor } from "./abstractions/Processor.ts";
import type { PipelineBuilder } from "./PipelineBuilder.ts";
import type { PipelineRunner } from "~/features/PipelineRunner/index.ts";

// A register-time token is either the Abstraction itself or an Implementation
// class produced by `Abstraction.createImplementation({...})` (e.g., DdbScanner,
// OsProcessor). Implementation classes carry the abstraction in metadata; the
// runtime helper below pulls it out.
type AbstractionToken<T> =
    | Abstraction<T>
    | (new (...args: never[]) => T);

export interface PipelineDefinition<TRecord, TContext extends Processor.Context, TShard> {
    readonly name: string;
    register(
        runner: PipelineRunner.Interface,
        scanner: AbstractionToken<Scanner.Interface<TRecord, TShard>>,
        processor: AbstractionToken<Processor.Interface<TRecord, TContext>>
    ): void;
}

function resolveAbstraction<T>(token: AbstractionToken<T>): Abstraction<T> {
    if (token instanceof Abstraction) {
        return token;
    }
    return new Metadata(
        token as unknown as new (...args: never[]) => unknown
    ).getAbstraction() as Abstraction<T>;
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
                scanner: resolveAbstraction(scanner),
                processor: resolveAbstraction(processor)
            });
            configure(builder);
            runner.register(builder.build());
        }
    };
}

import { Abstraction, Metadata } from "@webiny/di";
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

/**
 * Resolves an incoming scanner/processor token to its underlying Abstraction.
 *
 * `.register(...)` accepts either a concrete Abstraction (e.g., the generic
 * `Scanner` / `Processor` tokens) or an Implementation class produced by
 * `Abstraction.createImplementation({...})` (e.g., `DdbScanner`, `OsProcessor`).
 * Implementation classes carry the abstraction in their metadata but lack the
 * `.token` property that `container.resolve(...)` needs — so we extract it.
 */
function resolveAbstraction<T>(token: Abstraction<T> | { prototype: unknown }): Abstraction<T> {
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

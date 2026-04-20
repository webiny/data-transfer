import { Metadata, type Abstraction, type Constructor } from "@webiny/di";
import { PipelineBuilder } from "~/domain/pipeline/PipelineBuilder.ts";
import type { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import type { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { PipelineBuilderFactory as PipelineBuilderFactoryAbstraction } from "./abstractions/PipelineBuilderFactory.ts";

type AnyImpl = Constructor<unknown> & { __abstraction: Abstraction<unknown> };

type ProcessorToken = Abstraction<
    Processor.Interface<BaseTransformContext.Interface<unknown>, any>
>;

type CreateMethod = PipelineBuilderFactoryAbstraction.Interface["create"];

class PipelineBuilderFactoryImpl implements PipelineBuilderFactoryAbstraction.Interface {
    public create: CreateMethod = ((input: {
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
        // The public interface narrows this via IPipelineBuilderFactory.create;
        // the implementation is intentionally widened.
        return new PipelineBuilder({
            name: input.name,
            scanner: scannerAbstraction,
            processors: processorAbstractions
        });
    }) as unknown as CreateMethod;
}

export const PipelineBuilderFactory = PipelineBuilderFactoryAbstraction.createImplementation({
    implementation: PipelineBuilderFactoryImpl,
    dependencies: []
});

import { Metadata, type Abstraction, type Constructor, type Container } from "@webiny/di";
import { PipelineBuilder } from "~/domain/pipeline/PipelineBuilder.ts";
import type { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { ContainerToken } from "~/base/index.ts";
import { PipelineBuilderFactory as PipelineBuilderFactoryAbstraction } from "./abstractions/PipelineBuilderFactory.ts";

type AnyImpl = Constructor<unknown> & { __abstraction: Abstraction<unknown> };

type ProcessorInstance = Processor.Interface<any, any>;

type CreateMethod = PipelineBuilderFactoryAbstraction.Interface["create"];

class PipelineBuilderFactoryImpl implements PipelineBuilderFactoryAbstraction.Interface {
    public constructor(private readonly container: Container) {}

    public create: CreateMethod = ((input: {
        name: string;
        scanner: AnyImpl;
        processors: readonly AnyImpl[];
    }) => {
        const scannerAbstraction = new Metadata(input.scanner).getAbstraction() as Abstraction<
            Scanner.Interface<unknown, unknown>
        >;

        const allProcessors = this.container.resolveAll(Processor);
        const processorInstances = input.processors.map(implClass => {
            const instance = allProcessors.find(p => p.constructor === implClass);
            if (!instance) {
                throw new Error(
                    `PipelineBuilderFactory: processor "${implClass.name}" is not registered in the container`
                );
            }
            return instance as ProcessorInstance;
        });

        // The public interface narrows this via IPipelineBuilderFactory.create;
        // the implementation is intentionally widened.
        return new PipelineBuilder({
            name: input.name,
            scanner: scannerAbstraction,
            processors: processorInstances
        });
    }) as unknown as CreateMethod;
}

export const PipelineBuilderFactory = PipelineBuilderFactoryAbstraction.createImplementation({
    implementation: PipelineBuilderFactoryImpl,
    dependencies: [ContainerToken]
});

import { type Abstraction, type Constructor, Metadata } from "@webiny/di";
import { PipelineBuilder } from "~/domain/pipeline/PipelineBuilder.ts";
import type { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { PipelineBuilderFactory as PipelineBuilderFactoryAbstraction } from "./abstractions/PipelineBuilderFactory.ts";

type AnyImpl = Constructor<unknown> & { __abstraction: Abstraction<unknown> };

type ProcessorInstance = Processor.Interface<any, any>;

// Widened input shape used internally — the public generic signature lives on
// the abstraction and is enforced at call sites via IPipelineBuilderFactory.
interface CreateImplInput {
    name: string;
    scanner: AnyImpl;
    processors: readonly AnyImpl[];
}

class PipelineBuilderFactoryImpl implements PipelineBuilderFactoryAbstraction.Interface {
    public constructor(private readonly processors: Processor.Interface[]) {}

    public create(input: CreateImplInput): PipelineBuilder<any, any, any> {
        const scannerAbstraction = new Metadata(input.scanner).getAbstraction() as Abstraction<
            Scanner.Interface<unknown, unknown>
        >;

        const processorInstances = input.processors.map(implClass => {
            const instance = this.processors.find(p => p.constructor === implClass);
            if (!instance) {
                throw new Error(
                    `PipelineBuilderFactory: processor "${implClass.name}" is not registered in the container`
                );
            }
            return instance as ProcessorInstance;
        });

        return new PipelineBuilder({
            name: input.name,
            scanner: scannerAbstraction,
            processors: processorInstances
        });
    }
}

export const PipelineBuilderFactory = PipelineBuilderFactoryAbstraction.createImplementation({
    implementation: PipelineBuilderFactoryImpl,
    dependencies: [[Processor, { multiple: true }]]
});

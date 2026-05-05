import { type Abstraction, type Constructor } from "@webiny/di";
import { PipelineBuilder } from "~/domain/pipeline/PipelineBuilder.ts";
import { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { PipelineBuilderFactory as PipelineBuilderFactoryAbstraction } from "./abstractions/PipelineBuilderFactory.ts";

type AnyImpl = Constructor<unknown> & { __abstraction: Abstraction<unknown> };

type ScannerInstance = Scanner.Interface<unknown, unknown>;

// Widened input shape used internally — the public generic signature lives on
// the abstraction and is enforced at call sites via IPipelineBuilderFactory.
interface CreateImplInput {
    name: string;
    scanner: AnyImpl;
    processors: readonly AnyImpl[];
}

class PipelineBuilderFactoryImpl implements PipelineBuilderFactoryAbstraction.Interface {
    public constructor(
        private readonly processors: Processor.Interface[],
        private readonly scanners: ScannerInstance[]
    ) {}

    public create(input: CreateImplInput): PipelineBuilder<any, any, any> {
        const scannerInstance = this.scanners.find(s => s.constructor === input.scanner);
        if (!scannerInstance) {
            throw new Error(
                `PipelineBuilderFactory: scanner "${input.scanner.name}" is not registered in the container`
            );
        }

        const processorInstances = input.processors.map(implClass => {
            const instance = this.processors.find(p => p.constructor === implClass);
            if (!instance) {
                throw new Error(
                    `PipelineBuilderFactory: processor "${implClass.name}" is not registered in the container`
                );
            }
            return instance;
        });

        return new PipelineBuilder({
            name: input.name,
            scanner: scannerInstance,
            processors: processorInstances
        });
    }
}

export const PipelineBuilderFactory = PipelineBuilderFactoryAbstraction.createImplementation({
    implementation: PipelineBuilderFactoryImpl,
    dependencies: [
        [Processor, { multiple: true }],
        [Scanner, { multiple: true }]
    ]
});

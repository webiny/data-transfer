import { createAbstraction } from "~/base/index.ts";
import type { PipelineCustomizerBuilder } from "~/domain/pipeline/PipelineCustomizerBuilder.ts";

interface IPipelineCustomizer {
    readonly name: string;
    canUse(pipelineName: string): boolean;
    configure(builder: PipelineCustomizerBuilder): void | Promise<void>;
}

export const PipelineCustomizer = createAbstraction<IPipelineCustomizer>("Core/PipelineCustomizer");

export namespace PipelineCustomizer {
    export type Interface = IPipelineCustomizer;
    export type Builder = PipelineCustomizerBuilder;
}

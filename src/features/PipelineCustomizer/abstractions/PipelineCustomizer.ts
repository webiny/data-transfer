import { createAbstraction } from "~/base/index.js";
import type { PipelineCustomizerBuilder } from "~/domain/pipeline/PipelineCustomizerBuilder.js";

interface IPipelineCustomizer {
    readonly name: string;
    canUse(pipelineName: string): boolean;
    configure(builder: PipelineCustomizerBuilder): Promise<void>;
}

export const PipelineCustomizer = createAbstraction<IPipelineCustomizer>("Core/PipelineCustomizer");

export namespace PipelineCustomizer {
    export type Interface = IPipelineCustomizer;
    export type Builder = PipelineCustomizerBuilder;
}

import type { PipelineCustomizerBuilder } from "../../../domain/pipeline/PipelineCustomizerBuilder.js";
interface IPipelineCustomizer {
  readonly name: string;
  canUse(pipelineName: string): boolean;
  configure(builder: PipelineCustomizerBuilder): Promise<void>;
}
export declare const PipelineCustomizer: import("@webiny/di").Abstraction<IPipelineCustomizer>;
export declare namespace PipelineCustomizer {
  type Interface = IPipelineCustomizer;
  type Builder = PipelineCustomizerBuilder;
}
export {};
//# sourceMappingURL=PipelineCustomizer.d.ts.map

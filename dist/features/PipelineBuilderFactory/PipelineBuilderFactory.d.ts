import { type Abstraction, type Constructor } from "@webiny/di";
import { PipelineBuilder } from "../../domain/pipeline/PipelineBuilder.js";
import { Scanner } from "../../domain/pipeline/abstractions/Scanner.js";
import { Processor } from "../../domain/pipeline/abstractions/Processor.js";
import { PipelineCustomizer } from "../../features/PipelineCustomizer/abstractions/PipelineCustomizer.js";
import { PipelineBuilderFactory as PipelineBuilderFactoryAbstraction } from "./abstractions/PipelineBuilderFactory.ts";
import type { Logger } from "../../tools/Logger/abstractions/Logger.js";
export type { IPipelineBuilderFactory } from "./abstractions/PipelineBuilderFactory.js";
type AnyImpl = Constructor<unknown> & {
  __abstraction: Abstraction<unknown>;
};
type ScannerInstance = Scanner.Interface<unknown, unknown>;
interface CreateImplInput {
  name: string;
  scanner: AnyImpl;
  processors: readonly AnyImpl[];
}
declare class PipelineBuilderFactoryImpl implements PipelineBuilderFactoryAbstraction.Interface {
  private readonly processors;
  private readonly scanners;
  private readonly customizers;
  private readonly consumedCustomizers;
  constructor(
    processors: Processor.Interface[],
    scanners: ScannerInstance[],
    customizers: PipelineCustomizer.Interface[]
  );
  create(input: CreateImplInput): PipelineBuilder<any, any, any>;
  warnUnmatchedCustomizers(logger: Logger.Interface): void;
}
export declare const PipelineBuilderFactory: typeof PipelineBuilderFactoryImpl & {
  __abstraction: Abstraction<
    import("./abstractions/PipelineBuilderFactory.ts").IPipelineBuilderFactory
  >;
};
//# sourceMappingURL=PipelineBuilderFactory.d.ts.map

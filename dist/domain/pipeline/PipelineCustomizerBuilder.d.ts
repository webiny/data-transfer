import type { Filter } from "./Filter.ts";
import type { Transformer } from "./abstractions/Transformer.ts";
export declare class PipelineCustomizerBuilder {
  private readonly filters;
  private readonly transformers;
  filter(filter: Filter<any>): this;
  use(transformer: Transformer.Interface<any> | readonly Transformer.Interface<any>[]): this;
  getFilters(): readonly Filter<any>[];
  getTransformers(): readonly Transformer.Interface<any>[];
}
//# sourceMappingURL=PipelineCustomizerBuilder.d.ts.map

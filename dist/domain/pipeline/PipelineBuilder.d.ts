import type { Abstraction } from "@webiny/di";
import type { Scanner } from "./abstractions/Scanner.ts";
import type { Processor } from "./abstractions/Processor.ts";
import type { Hook } from "./abstractions/Hook.ts";
import type { Transformer } from "./abstractions/Transformer.ts";
import type { Filter } from "./Filter.ts";
import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
import type { PipelineCustomizer } from "../../features/PipelineCustomizer/abstractions/PipelineCustomizer.js";
import { Pipeline } from "./Pipeline.ts";
export interface PipelineBuilderConfig<
  TRecord,
  _TContext extends BaseTransformContext.Interface<TRecord>,
  TShard
> {
  name: string;
  scanner: Scanner.Interface<TRecord, TShard>;
  processors: readonly Processor.Interface<BaseTransformContext.Interface<TRecord>, any>[];
  customizers: readonly PipelineCustomizer.Interface[];
}
export declare class PipelineBuilder<
  TRecord = unknown,
  TContext extends BaseTransformContext.Interface<TRecord> =
    BaseTransformContext.Interface<TRecord>,
  TShard = unknown
> {
  private readonly name;
  private readonly scanner;
  private readonly processors;
  private readonly customizers;
  private filters;
  private transformers;
  private beforeHooks;
  private afterHooks;
  private blackholeCommands;
  constructor(config: PipelineBuilderConfig<TRecord, TContext, TShard>);
  /**
   * Add a filter. Order across .filter() calls within a single builder
   * does NOT matter — all filters are AND-composed. PipelineCustomizer
   * filters are always appended after the preset's filters at build()
   * time.
   */
  filter(filter: Filter<TRecord>): this;
  /**
   * Register one or more transformers. Transformers see the effective
   * context — BaseTransformContext merged with every processor slice
   * from the pipeline's processor list.
   *
   * Accepts a single transformer OR an array, so shared stacks can be
   * declared once and applied across pipelines:
   *
   *   const contentStack = [wrapInData, addGsiTenant, removeAttributes];
   *   factory.create({...}).filter(...).use(contentStack).build();
   *
   * Arrays are appended element-by-element in order; mixing array and
   * single calls is fine — the internal list just accumulates.
   */
  use(
    transformer: Transformer.Interface<TContext> | readonly Transformer.Interface<TContext>[]
  ): this;
  beforeExecuteCommands(token: Abstraction<Hook.Interface>): this;
  afterExecuteCommands(token: Abstraction<Hook.Interface>): this;
  /**
   * Observe-only mode. Filters + transformers + onEnd all run as usual,
   * but every command emitted during a blackholed record is dropped at
   * the per-record → shard fold step, so nothing from this pipeline
   * lands on the target. Useful for dry-runs of a single pipeline
   * inside an otherwise real transfer, or for validation-only passes
   * that don't produce writes.
   *
   * Accepts an optional predicate — if provided, blackhole mode is only
   * activated when the predicate returns true. Evaluated immediately at
   * call time, so any variables closed over are resolved in the same
   * synchronous configure() context.
   */
  blackhole(condition?: () => boolean): this;
  build(): Promise<Pipeline<TRecord, TContext, TShard>>;
}
//# sourceMappingURL=PipelineBuilder.d.ts.map

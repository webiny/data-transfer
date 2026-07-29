import type { Abstraction } from "@webiny/di";
import type { Scanner } from "./abstractions/Scanner.ts";
import type { Processor } from "./abstractions/Processor.ts";
import type { Hook } from "./abstractions/Hook.ts";
import type { Transformer } from "./abstractions/Transformer.ts";
import type { Filter } from "./Filter.ts";
import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
export interface PipelineConfig<
  TRecord,
  TContext extends BaseTransformContext.Interface<TRecord>,
  TShard
> {
  readonly name: string;
  readonly scanner: Scanner.Interface<TRecord, TShard>;
  readonly processors: readonly Processor.Interface<BaseTransformContext.Interface<TRecord>, any>[];
  readonly filters: readonly Filter<TRecord>[];
  readonly transformers: readonly Transformer.Interface<TContext>[];
  readonly beforeHooks: readonly Abstraction<Hook.Interface>[];
  readonly afterHooks: readonly Abstraction<Hook.Interface>[];
  /**
   * When true, the runner runs filters + transformers + onEnd as
   * usual but discards every command at the per-record fold step —
   * no puts, no copies, nothing lands in the target. Useful for
   * observe-only pipelines (validation, logging, dry-runs of a
   * single pipeline inside an otherwise real transfer). Optional —
   * defaults to false via the Pipeline class getter.
   */
  readonly blackhole?: boolean;
}
export declare class Pipeline<
  TRecord = unknown,
  TContext extends BaseTransformContext.Interface<TRecord> =
    BaseTransformContext.Interface<TRecord>,
  TShard = unknown
> {
  private readonly config;
  constructor(config: PipelineConfig<TRecord, TContext, TShard>);
  get name(): string;
  get scanner(): Scanner.Interface<TRecord, TShard>;
  get processors(): readonly Processor.Interface<BaseTransformContext.Interface<TRecord>, any>[];
  get beforeHookTokens(): readonly Abstraction<Hook.Interface>[];
  get afterHookTokens(): readonly Abstraction<Hook.Interface>[];
  get transformerFns(): readonly Transformer.Interface<TContext>[];
  get hasFilter(): boolean;
  get isBlackhole(): boolean;
  accepts(record: TRecord): Promise<boolean>;
}
//# sourceMappingURL=Pipeline.d.ts.map

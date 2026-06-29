import type { Abstraction } from "@webiny/di";
import type { Scanner } from "./abstractions/Scanner.ts";
import type { Processor } from "./abstractions/Processor.ts";
import type { Hook } from "./abstractions/Hook.ts";
import type { Transformer } from "./abstractions/Transformer.ts";
import type { Filter } from "./Filter.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { PipelineCustomizer } from "~/features/PipelineCustomizer/abstractions/PipelineCustomizer.ts";
import { PipelineCustomizerBuilder } from "./PipelineCustomizerBuilder.ts";
import { Pipeline, type PipelineConfig } from "./Pipeline.ts";

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

export class PipelineBuilder<
    TRecord = unknown,
    TContext extends BaseTransformContext.Interface<TRecord> =
        BaseTransformContext.Interface<TRecord>,
    TShard = unknown
> {
    private readonly name: string;
    private readonly scanner: Scanner.Interface<TRecord, TShard>;
    private readonly processors: readonly Processor.Interface<
        BaseTransformContext.Interface<TRecord>,
        any
    >[];
    private readonly customizers: readonly PipelineCustomizer.Interface[];

    private filters: Filter<TRecord>[] = [];
    private transformers: Transformer.Interface<TContext>[] = [];
    private beforeHooks: Abstraction<Hook.Interface>[] = [];
    private afterHooks: Abstraction<Hook.Interface>[] = [];
    private blackholeCommands: boolean = false;

    public constructor(config: PipelineBuilderConfig<TRecord, TContext, TShard>) {
        if (!config.name || config.name.trim().length === 0) {
            throw new Error("PipelineBuilder: `name` is required and must be non-empty");
        }
        this.name = config.name;
        this.scanner = config.scanner;
        this.processors = config.processors;
        this.customizers = config.customizers;
    }

    /**
     * Add a filter. Order across .filter() calls within a single builder
     * does NOT matter — all filters are AND-composed. PipelineCustomizer
     * filters are always appended after the preset's filters at build()
     * time.
     */
    public filter(filter: Filter<TRecord>): this {
        this.filters.push(filter);
        return this;
    }

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
    public use(
        transformer: Transformer.Interface<TContext> | readonly Transformer.Interface<TContext>[]
    ): this {
        if (Array.isArray(transformer)) {
            for (const item of transformer) {
                this.transformers.push(item);
            }
        } else {
            this.transformers.push(transformer as Transformer.Interface<TContext>);
        }
        return this;
    }

    public beforeExecuteCommands(token: Abstraction<Hook.Interface>): this {
        this.beforeHooks.push(token);
        return this;
    }

    public afterExecuteCommands(token: Abstraction<Hook.Interface>): this {
        this.afterHooks.push(token);
        return this;
    }

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
    public blackhole(condition?: () => boolean): this {
        if (condition === undefined || condition()) {
            this.blackholeCommands = true;
        }
        return this;
    }

    public build(): Pipeline<TRecord, TContext, TShard> {
        const custFilters: Filter<TRecord>[] = [];
        const custTransformers: Transformer.Interface<TContext>[] = [];

        for (const customizer of this.customizers) {
            if (!customizer.canUse(this.name)) {
                continue;
            }
            const custBuilder = new PipelineCustomizerBuilder();
            customizer.configure(custBuilder);
            custFilters.push(...custBuilder.getFilters());
            custTransformers.push(...custBuilder.getTransformers());
        }

        const pipelineConfig: PipelineConfig<TRecord, TContext, TShard> = {
            name: this.name,
            scanner: this.scanner,
            processors: this.processors,
            filters: [...this.filters, ...custFilters],
            transformers: [...this.transformers, ...custTransformers],
            beforeHooks: [...this.beforeHooks],
            afterHooks: [...this.afterHooks],
            blackhole: this.blackholeCommands
        };
        return new Pipeline(pipelineConfig);
    }
}

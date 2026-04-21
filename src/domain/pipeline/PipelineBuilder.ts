import type { Abstraction } from "@webiny/di";
import type { Scanner } from "./abstractions/Scanner.ts";
import type { Processor } from "./abstractions/Processor.ts";
import type { Hook } from "./abstractions/Hook.ts";
import type { Transformer } from "./abstractions/Transformer.ts";
import type { Filter } from "./Filter.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { Pipeline, type PipelineConfig } from "./Pipeline.ts";

export interface PipelineBuilderConfig<
    TRecord,
    TContext extends BaseTransformContext.Interface<TRecord>,
    TShard
> {
    name: string;
    scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    processors: readonly Abstraction<
        Processor.Interface<BaseTransformContext.Interface<TRecord>, any>
    >[];
}

export class PipelineBuilder<
    TRecord = unknown,
    TContext extends BaseTransformContext.Interface<TRecord> =
        BaseTransformContext.Interface<TRecord>,
    TShard = unknown
> {
    private readonly name: string;
    private readonly scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    private readonly processors: readonly Abstraction<
        Processor.Interface<BaseTransformContext.Interface<TRecord>, any>
    >[];

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
    }

    /**
     * Add a filter. Order across .filter() calls does NOT matter — all
     * filters are collected and AND-composed at build time. Multiple
     * calls are allowed; interleaving with .use() is fine. Filters
     * operate on the record only (not ctx).
     */
    public filter(filter: Filter<TRecord>): this {
        this.filters.push(filter);
        return this;
    }

    /**
     * Register a transformer. Transformers see the effective context —
     * BaseTransformContext merged with every processor slice from the
     * pipeline's processor list.
     */
    public use(transformer: Transformer.Interface<TContext>): this {
        this.transformers.push(transformer);
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
     */
    public blackhole(): this {
        this.blackholeCommands = true;
        return this;
    }

    public build(): Pipeline<TRecord, TContext, TShard> {
        const pipelineConfig: PipelineConfig<TRecord, TContext, TShard> = {
            name: this.name,
            scanner: this.scanner,
            processors: this.processors,
            filters: [...this.filters],
            transformers: [...this.transformers],
            beforeHooks: [...this.beforeHooks],
            afterHooks: [...this.afterHooks],
            blackhole: this.blackholeCommands
        };
        return new Pipeline(pipelineConfig);
    }
}

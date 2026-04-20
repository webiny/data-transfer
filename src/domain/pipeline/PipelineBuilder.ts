import type { Abstraction } from "@webiny/di";
import type { Scanner } from "./abstractions/Scanner.ts";
import type { Processor } from "./abstractions/Processor.ts";
import type { Hook } from "./abstractions/Hook.ts";
import type { Transformer } from "./abstractions/Transformer.ts";
import type { Filter } from "./Filter.ts";
import { Pipeline, type PipelineConfig } from "./Pipeline.ts";

export interface PipelineBuilderConfig<TRecord, TContext extends Processor.Context, TShard> {
    name: string;
    scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    processor: Abstraction<Processor.Interface<TRecord, TContext>>;
}

export class PipelineBuilder<
    TRecord = unknown,
    TContext extends Processor.Context = Processor.Context,
    TShard = unknown
> {
    private readonly name: string;
    private readonly scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    private readonly processor: Abstraction<Processor.Interface<TRecord, TContext>>;

    private filters: Filter<TRecord>[] = [];
    private transformers: Transformer.Interface<TContext>[] = [];
    private beforeHooks: Abstraction<Hook.Interface>[] = [];
    private afterHooks: Abstraction<Hook.Interface>[] = [];

    public constructor(config: PipelineBuilderConfig<TRecord, TContext, TShard>) {
        if (!config.name || config.name.trim().length === 0) {
            throw new Error("PipelineBuilder: `name` is required and must be non-empty");
        }
        this.name = config.name;
        this.scanner = config.scanner;
        this.processor = config.processor;
    }

    /**
     * Add a filter. Order across .filter() calls does NOT matter — all
     * filters are collected and AND-composed at build time. Multiple
     * calls are allowed; interleaving with .use() is fine.
     */
    public filter(filter: Filter<TRecord>): this {
        this.filters.push(filter);
        return this;
    }

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

    public build(): Pipeline<TRecord, TContext, TShard> {
        const pipelineConfig: PipelineConfig<TRecord, TContext, TShard> = {
            name: this.name,
            scanner: this.scanner,
            processor: this.processor,
            filters: [...this.filters],
            transformers: [...this.transformers],
            beforeHooks: [...this.beforeHooks],
            afterHooks: [...this.afterHooks]
        };
        return new Pipeline(pipelineConfig);
    }
}

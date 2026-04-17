import type { Abstraction, Container } from "@webiny/di";
import type { Scanner } from "./abstractions/Scanner.ts";
import type { Processor } from "./abstractions/Processor.ts";
import type { Hook } from "./abstractions/Hook.ts";
import type { Filter } from "./Filter.ts";
import { Pipeline, type PipelineConfig } from "./Pipeline.ts";

export interface PipelineBuilderConfig<TRecord, TContext, TShard> {
    name: string;
    scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    processor: Abstraction<Processor.Interface<TRecord, TContext>>;
    container: Container;
}

export class PipelineBuilder<TRecord = unknown, TContext = unknown, TShard = unknown> {
    private readonly name: string;
    private readonly scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    private readonly processor: Abstraction<Processor.Interface<TRecord, TContext>>;
    private readonly container: Container;

    private filters: Filter<TRecord>[] = [];
    private filterCalled = false;
    private transformers: Abstraction<unknown>[] = [];
    private beforeHooks: Abstraction<Hook.Interface>[] = [];
    private afterHooks: Abstraction<Hook.Interface>[] = [];

    public constructor(config: PipelineBuilderConfig<TRecord, TContext, TShard>) {
        if (!config.name || config.name.trim().length === 0) {
            throw new Error("PipelineBuilder: `name` is required and must be non-empty");
        }
        this.name = config.name;
        this.scanner = config.scanner;
        this.processor = config.processor;
        this.container = config.container;
    }

    public filter(input: Filter<TRecord> | Filter<TRecord>[]): this {
        if (this.filterCalled) {
            throw new Error(
                `PipelineBuilder "${this.name}": .filter() already called. ` +
                    "Pass an array to apply multiple filters in one call."
            );
        }
        const asArray = Array.isArray(input) ? input : [input];
        if (asArray.length === 0) {
            throw new Error(
                `PipelineBuilder "${this.name}": .filter([]) is empty — ` +
                    "pass at least one filter or omit the call entirely."
            );
        }
        this.filters = asArray;
        this.filterCalled = true;
        return this;
    }

    public use(token: Abstraction<unknown>): this {
        this.transformers.push(token);
        return this;
    }

    public build(): Pipeline<TRecord, TContext, TShard> {
        if (!this.filterCalled) {
            throw new Error(
                `PipelineBuilder "${this.name}": .filter() is required ` +
                    "(use createFilter(() => true) for an explicit catch-all)."
            );
        }
        const pipelineConfig: PipelineConfig<TRecord, TContext, TShard> = {
            name: this.name,
            scanner: this.scanner,
            processor: this.processor,
            filters: [...this.filters],
            transformers: [...this.transformers],
            beforeHooks: [...this.beforeHooks],
            afterHooks: [...this.afterHooks]
        };
        return new Pipeline(pipelineConfig, this.container);
    }
}

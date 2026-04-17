import type { Abstraction } from "@webiny/di";
import type { Scanner } from "./abstractions/Scanner.ts";
import type { Processor } from "./abstractions/Processor.ts";
import type { Hook } from "./abstractions/Hook.ts";
import type { Transformer } from "./abstractions/Transformer.ts";
import type { Filter } from "./Filter.ts";

export interface PipelineConfig<TRecord, TContext extends Processor.Context, TShard> {
    readonly name: string;
    readonly scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    readonly processor: Abstraction<Processor.Interface<TRecord, TContext>>;
    readonly filters: readonly Filter<TRecord>[];
    readonly transformers: readonly Abstraction<Transformer.Interface<TContext>>[];
    readonly beforeHooks: readonly Abstraction<Hook.Interface>[];
    readonly afterHooks: readonly Abstraction<Hook.Interface>[];
}

export class Pipeline<
    TRecord = unknown,
    TContext extends Processor.Context = Processor.Context,
    TShard = unknown
> {
    public constructor(private readonly config: PipelineConfig<TRecord, TContext, TShard>) {
        Object.freeze(this);
    }

    public get name(): string {
        return this.config.name;
    }

    public get scannerToken(): Abstraction<Scanner.Interface<TRecord, TShard>> {
        return this.config.scanner;
    }

    public get processorToken(): Abstraction<Processor.Interface<TRecord, TContext>> {
        return this.config.processor;
    }

    public get beforeHookTokens(): readonly Abstraction<Hook.Interface>[] {
        return this.config.beforeHooks;
    }

    public get afterHookTokens(): readonly Abstraction<Hook.Interface>[] {
        return this.config.afterHooks;
    }

    public get transformerTokens(): readonly Abstraction<Transformer.Interface<TContext>>[] {
        return this.config.transformers;
    }

    public get hasFilter(): boolean {
        return this.config.filters.length > 0;
    }

    public accepts(record: TRecord): boolean {
        for (const filter of this.config.filters) {
            if (!filter.check(record)) {
                return false;
            }
        }
        return true;
    }
}

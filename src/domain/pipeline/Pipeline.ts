import type { Abstraction, Container } from "@webiny/di";
import type { Scanner } from "./abstractions/Scanner.ts";
import type { Processor } from "./abstractions/Processor.ts";
import type { Hook } from "./abstractions/Hook.ts";
import type { Filter } from "./Filter.ts";

export interface PipelineConfig<TRecord, TContext, TShard> {
    readonly name: string;
    readonly scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    readonly processor: Abstraction<Processor.Interface<TRecord, TContext>>;
    readonly filters: readonly Filter<TRecord>[];
    readonly transformers: readonly Abstraction<unknown>[];
    readonly beforeHooks: readonly Abstraction<Hook.Interface>[];
    readonly afterHooks: readonly Abstraction<Hook.Interface>[];
}

export class Pipeline<TRecord = unknown, TContext = unknown, TShard = unknown> {
    public constructor(
        private readonly config: PipelineConfig<TRecord, TContext, TShard>,
        private readonly container: Container
    ) {
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

    public async run(ctx: TContext): Promise<void> {
        for (const token of this.config.transformers) {
            const transformer = this.container.resolve(
                token as Abstraction<{ transform(ctx: TContext): void | Promise<void> }>
            );
            await transformer.transform(ctx);
        }
    }

    protected getContainer(): Container {
        return this.container;
    }

    protected getFilters(): readonly Filter<TRecord>[] {
        return this.config.filters;
    }

    protected getTransformerTokens(): readonly Abstraction<unknown>[] {
        return this.config.transformers;
    }
}

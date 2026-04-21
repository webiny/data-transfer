import type { Abstraction } from "@webiny/di";
import type { Scanner } from "./abstractions/Scanner.ts";
import type { Processor } from "./abstractions/Processor.ts";
import type { Hook } from "./abstractions/Hook.ts";
import type { Transformer } from "./abstractions/Transformer.ts";
import type { Filter } from "./Filter.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

export interface PipelineConfig<
    TRecord,
    TContext extends BaseTransformContext.Interface<TRecord>,
    TShard
> {
    readonly name: string;
    readonly scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    readonly processors: readonly Abstraction<
        Processor.Interface<BaseTransformContext.Interface<TRecord>, any>
    >[];
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

export class Pipeline<
    TRecord = unknown,
    TContext extends BaseTransformContext.Interface<TRecord> =
        BaseTransformContext.Interface<TRecord>,
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

    public get processorTokens(): readonly Abstraction<
        Processor.Interface<BaseTransformContext.Interface<TRecord>, any>
    >[] {
        return this.config.processors;
    }

    public get beforeHookTokens(): readonly Abstraction<Hook.Interface>[] {
        return this.config.beforeHooks;
    }

    public get afterHookTokens(): readonly Abstraction<Hook.Interface>[] {
        return this.config.afterHooks;
    }

    public get transformerFns(): readonly Transformer.Interface<TContext>[] {
        return this.config.transformers;
    }

    public get hasFilter(): boolean {
        return this.config.filters.length > 0;
    }

    public get isBlackhole(): boolean {
        return this.config.blackhole === true;
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

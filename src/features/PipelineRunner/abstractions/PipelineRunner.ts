import { createAbstraction } from "~/base/index.ts";
import type { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { Pipeline } from "~/domain/pipeline/Pipeline.ts";
import type { PipelineBuilder } from "~/domain/pipeline/PipelineBuilder.ts";
import type {
    NonEmptyArray,
    DisjointKeys,
    PipelineFactoryInput
} from "~/features/PipelineBuilderFactory/abstractions/PipelineBuilderFactory.ts";
import type { Abstraction, Constructor } from "@webiny/di";
import type { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";

// ============================================================================
// Type utilities re-exported from the PipelineBuilderFactory abstraction.
//
// The factory is the single source of truth for the pipeline type machinery
// (NonEmptyArray, DisjointKeys, MergeSlices, EffectiveContext, ScannerImpl,
// ProcessorImpl, SliceOf, ...). PipelineRunner keeps `pipeline(...)` as a
// compatibility surface until Task 3, so we re-import the pieces we need.
// ============================================================================

export type { NonEmptyArray } from "~/features/PipelineBuilderFactory/abstractions/PipelineBuilderFactory.ts";

// Local copies of the Impl helper types — these are not exported from the
// factory (kept private there too). Duplicating them here avoids widening the
// factory's public surface while still letting the runner's `pipeline<...>()`
// signature compile. Both copies go away in Task 3 when pipeline() is removed.

type ScannerImpl<TRecord, TShard> = Constructor<Scanner.Interface<TRecord, TShard>> & {
    __abstraction: Abstraction<unknown>;
};

type ProcessorImpl<TBase extends BaseTransformContext.Interface<unknown>, TSlice> = Constructor<
    Processor.Interface<TBase, TSlice>
> & { __abstraction: Abstraction<unknown> };

type SliceOf<P> = P extends ProcessorImpl<any, infer S> ? S : never;

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
    k: infer I
) => void
    ? I
    : never;

type MergeSlices<T extends readonly unknown[]> = UnionToIntersection<
    { [K in keyof T]: SliceOf<T[K]> }[number]
>;

type EffectiveContext<
    TRecord,
    TProcessors extends readonly unknown[]
> = BaseTransformContext.Interface<TRecord> & MergeSlices<TProcessors>;

// ============================================================================
// Run options (runner-specific)
// ============================================================================

export interface RunOptions {
    /** Zero-based index of the shard this runner invocation should process. */
    segment: number;
    /** Total number of shards. Must match the scanner's reported shard count. */
    totalSegments: number;
}

// ============================================================================
// PipelineRunner abstraction
// ============================================================================

interface IPipelineRunner {
    pipeline<
        TRecord,
        TShard,
        TProcessors extends NonEmptyArray<
            ProcessorImpl<BaseTransformContext.Interface<TRecord>, any>
        >
    >(
        input: PipelineFactoryInput<ScannerImpl<TRecord, TShard>, DisjointKeys<TProcessors>>
    ): PipelineBuilder<TRecord, EffectiveContext<TRecord, TProcessors>, TShard>;

    /**
     * Register one or more pipelines. Heterogeneous record/context types are
     * allowed (each pipeline runs with its own scanner + processor set); the
     * parameter type is intentionally widened so concrete narrow pipelines
     * are accepted without casts.
     */
    register(...pipelines: Pipeline<any, any, any>[]): this;

    run(opts?: RunOptions): Promise<void>;

    getProcessors(): Processor.Interface<BaseTransformContext.Interface<unknown>, any>[];
}

export const PipelineRunner = createAbstraction<IPipelineRunner>("Core/PipelineRunner");

export namespace PipelineRunner {
    export type Interface = IPipelineRunner;
    export type FactoryInput<TScanner, TProcessors> = PipelineFactoryInput<TScanner, TProcessors>;
    export type Run = RunOptions;
}

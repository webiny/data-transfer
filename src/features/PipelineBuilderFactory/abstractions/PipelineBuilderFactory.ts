import type { Abstraction, Constructor } from "@webiny/di";
import { createAbstraction } from "~/base/index.js";
import type { Scanner } from "~/domain/pipeline/abstractions/Scanner.js";
import type { Processor } from "~/domain/pipeline/abstractions/Processor.js";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.js";
import type { PipelineBuilder } from "~/domain/pipeline/PipelineBuilder.js";
import type { Logger } from "~/tools/Logger/abstractions/Logger.js";

// ============================================================================
// Type utilities
// ============================================================================

export type NonEmptyArray<T> = readonly [T, ...T[]];

type ScannerImpl<TRecord, TShard> = Constructor<Scanner.Interface<TRecord, TShard>> & {
    __abstraction: Abstraction<unknown>;
};

type ProcessorImpl<TBase extends BaseTransformContext.Interface<unknown>, TSlice> = Constructor<
    Processor.Interface<TBase, TSlice>
> & { __abstraction: Abstraction<unknown> };

/** Extract the slice type out of a Processor Impl class. */
type SliceOf<P> = P extends ProcessorImpl<any, infer S> ? S : never;

/** Convert a union to an intersection: { a: 1 } | { b: 2 }  ->  { a: 1 } & { b: 2 }. */
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
    k: infer I
) => void
    ? I
    : never;

/** Merge all slices of the tuple into a single intersection type. */
type MergeSlices<T extends readonly unknown[]> = UnionToIntersection<
    { [K in keyof T]: SliceOf<T[K]> }[number]
>;

/** Effective context visible to transformers: BaseTransformContext ∧ all merged slices. */
type EffectiveContext<
    TRecord,
    TProcessors extends readonly unknown[]
> = BaseTransformContext.Interface<TRecord> & MergeSlices<TProcessors>;

// ----------------------------------------------------------------------------
// Disjoint-keys: reject tuples where two processors contribute overlapping
// slice keys. Walks the tuple element-by-element; on each step, compares the
// head's slice keys against the union of every tail processor's slice keys.
// ----------------------------------------------------------------------------

type MergedTailKeys<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
    ? keyof SliceOf<Head> | MergedTailKeys<Tail>
    : never;

type HasDuplicateSliceKeys<T extends readonly unknown[]> = T extends readonly [
    infer Head,
    ...infer Tail
]
    ? keyof SliceOf<Head> & MergedTailKeys<Tail> extends never
        ? HasDuplicateSliceKeys<Tail>
        : true
    : false;

export type DisjointKeys<T extends readonly unknown[]> =
    HasDuplicateSliceKeys<T> extends true ? never : T;

// ============================================================================
// Factory input
// ============================================================================

export interface PipelineFactoryInput<TScanner, TProcessors> {
    name: string;
    scanner: TScanner;
    processors: TProcessors;
}

// ============================================================================
// PipelineBuilderFactory abstraction
// ============================================================================

export interface IPipelineBuilderFactory {
    create<
        TRecord,
        TShard,
        TProcessors extends NonEmptyArray<
            ProcessorImpl<BaseTransformContext.Interface<TRecord>, any>
        >
    >(
        input: PipelineFactoryInput<ScannerImpl<TRecord, TShard>, DisjointKeys<TProcessors>>
    ): PipelineBuilder<TRecord, EffectiveContext<TRecord, TProcessors>, TShard>;
    warnUnmatchedCustomizers(logger: Logger.Interface): void;
}

export const PipelineBuilderFactory = createAbstraction<IPipelineBuilderFactory>(
    "Core/PipelineBuilderFactory"
);

export namespace PipelineBuilderFactory {
    export type Interface = IPipelineBuilderFactory;
    export type FactoryInput<TScanner, TProcessors> = PipelineFactoryInput<TScanner, TProcessors>;
}

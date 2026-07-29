import { createAbstraction } from "~/base/index.js";
import type { Processor } from "~/domain/pipeline/abstractions/Processor.js";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.js";
import type { Pipeline } from "~/domain/pipeline/Pipeline.js";

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
// Shard stats — written per-worker, aggregated by the orchestrator.
// Uses plain Records (not Maps) so they serialise to JSON without conversion.
// ============================================================================

export interface RunStats {
    mergeGroupId: string;
    transferred: Record<string, number>;
    blackholed: Record<string, number>;
    unmatched: Record<string, number>;
}

// ============================================================================
// PipelineRunner abstraction
// ============================================================================

interface IPipelineRunner {
    /**
     * Register one or more pipelines. Heterogeneous record/context types are
     * allowed (each pipeline runs with its own scanner + processor set); the
     * parameter type is intentionally widened so concrete narrow pipelines
     * are accepted without casts.
     */
    register(...pipelines: Pipeline<any, any, any>[]): this;

    run(opts?: RunOptions): Promise<void>;

    getProcessors(): Processor.Interface<BaseTransformContext.Interface<unknown>, any>[];

    /** Returns stats from the most recent run(opts) call, or null if not yet run. */
    getShardStats(): RunStats | null;
}

export const PipelineRunner = createAbstraction<IPipelineRunner>("Core/PipelineRunner");

export namespace PipelineRunner {
    export type Interface = IPipelineRunner;
    export type Run = RunOptions;
}

import { createAbstraction } from "~/base/index.ts";
import type { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { Pipeline } from "~/domain/pipeline/Pipeline.ts";

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
    export type Run = RunOptions;
}

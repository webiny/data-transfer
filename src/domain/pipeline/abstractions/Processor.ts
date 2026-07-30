import { createAbstraction } from "~/base/index.js";
import type { Commands } from "~/domain/transform/commands/Commands.js";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.js";

interface IAfterShardContext {
    segment: number;
    totalSegments: number;
}

export interface IProcessor<
    TBaseContext extends BaseTransformContext.Interface<unknown> =
        BaseTransformContext.Interface<unknown>,
    TSlice = Record<string, never>
> {
    /**
     * Per-record helper contribution. Called once per record; returns a slice
     * of helpers spread onto the base ctx. Optional — pure execute-only
     * processors (e.g., a hypothetical metrics-only one) omit it.
     */
    extendContext?(base: TBaseContext): TSlice;

    /**
     * Per-record terminal hook. Runs after the transformer chain completes,
     * before processors' execute() is called at shard end. Same signature as
     * a transformer — uses slice helpers (or addCommand) to push terminal
     * commands. Optional — processors without a sensible per-record default
     * (e.g., S3Processor) omit it.
     *
     * Replaces the legacy "runner auto-puts ctx.record" magic — terminal
     * behavior is now declared in the processor that owns the put.
     */
    onEnd?(ctx: TBaseContext & TSlice): void | Promise<void>;

    /**
     * Pre-transfer access check. Called once in the orchestrator process before
     * any segment worker is spawned.
     *
     * Returns one entry per probed resource (table, bucket, cluster endpoint).
     * Mandatory (not optional) so every processor author must consciously decide
     * what to check — return `[]` if the processor has no AWS resources to probe.
     *
     * Status meanings:
     *   "ok"      — probe succeeded; proceed
     *   "denied"  — IAM / credentials error; transfer will be aborted
     *   "missing" — resource does not exist; transfer will be aborted
     *   "unknown" — probe failed for an unclassified reason; warn and proceed
     *
     * Implementations must not throw — catch all errors and return an "unknown"
     * entry instead.
     */
    checkAccess(): Promise<AccessCheck.Entry[]>;

    /**
     * Drain the processor's commands from the bag and write to target. The
     * act of calling commands.get(key) marks that key as "claimed" — the
     * runner uses Commands.unclaimedKeys() to warn-once on commands no
     * processor handled.
     */
    execute(commands: Commands): Promise<void>;

    /**
     * Per-shard terminal hook for persisting side-effect state the processor
     * owns (e.g., OsProcessor writing touchedIndexes state for the orchestrator-
     * side EnableRefreshHook to consume). Runs after execute() drains the
     * buffer, sequentially in processor array order. Optional — processors
     * without cross-boundary state omit it.
     */
    afterShard?(ctx: IAfterShardContext): void | Promise<void>;
}

export const Processor = createAbstraction<IProcessor<any, any>>("Core/Processor");

export namespace AccessCheck {
    export type Status = "ok" | "denied" | "missing" | "unknown";

    export interface Entry {
        label: string;
        status: Status;
        hint?: string;
    }

    export type Report = Entry[];
}

export namespace Processor {
    export type Interface<
        TBaseContext extends BaseTransformContext.Interface<unknown> =
            BaseTransformContext.Interface<unknown>,
        TSlice = Record<string, never>
    > = IProcessor<TBaseContext, TSlice>;

    export type AfterShardContext = IAfterShardContext;

    /**
     * Backwards-compatible alias referenced by Pipeline, PipelineBuilder,
     * PipelineRunner, Transformer, and createTransformer. Tasks 9/10 will
     * retire or rework these call sites; keeping the alias here avoids
     * rippling into files this task is not supposed to touch.
     */
    export type Context = BaseTransformContext.Interface<unknown>;

    /** Extract the slice type from a Processor Implementation class. */
    export type SliceOf<P> = P extends { extendContext(base: any): infer S }
        ? S
        : Record<string, never>;
}

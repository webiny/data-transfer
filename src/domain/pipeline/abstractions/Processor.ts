import { createAbstraction } from "~/base/index.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

interface IProcessor<
    TBaseContext extends BaseTransformContext.Interface<unknown> =
        BaseTransformContext.Interface<unknown>,
    TSlice = {}
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
     * Drain the processor's commands from the bag and write to target. The
     * act of calling commands.get(key) marks that key as "claimed" — the
     * runner uses Commands.unclaimedKeys() to warn-once on commands no
     * processor handled.
     */
    execute(commands: Commands): Promise<void>;

    /** Per-shard state for the worker handler to serialize and pass to after-hooks. */
    getShardState(): unknown;
}

export const Processor = createAbstraction<IProcessor<any, any>>("Core/Processor");

export namespace Processor {
    export type Interface<
        TBaseContext extends BaseTransformContext.Interface<unknown> =
            BaseTransformContext.Interface<unknown>,
        TSlice = {}
    > = IProcessor<TBaseContext, TSlice>;

    /**
     * Backwards-compatible alias referenced by Pipeline, PipelineBuilder,
     * PipelineRunner, Transformer, and createTransformer. Tasks 9/10 will
     * retire or rework these call sites; keeping the alias here avoids
     * rippling into files this task is not supposed to touch.
     */
    export type Context = BaseTransformContext.Interface<unknown>;

    /** Extract the slice type from a Processor Implementation class. */
    export type SliceOf<P> = P extends { extendContext(base: any): infer S } ? S : {};
}

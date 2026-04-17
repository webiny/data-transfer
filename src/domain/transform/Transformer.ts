import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

export interface Transformer<
    TCtx extends BaseTransformContext.Interface = BaseTransformContext.Interface
> {
    name: string;
    transform(ctx: TCtx): void | Promise<void>;
}

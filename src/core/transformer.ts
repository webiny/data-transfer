import { TransformContext } from "./types.ts";

// ============================================================================
// Transformer Interface
// ============================================================================

export interface Transformer<T = Record<string, unknown>> {
    name: string;
    transform(ctx: TransformContext<T>): void | Promise<void>;
}

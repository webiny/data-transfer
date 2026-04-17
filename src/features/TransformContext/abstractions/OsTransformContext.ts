import { createAbstraction } from "~/base/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { BaseTransformContext, BaseTransformContextFactory } from "./BaseTransformContext.ts";

// ============================================================================
// OS Context Interface
// ============================================================================

interface IOsTransformContext<
    TRecord = Record<string, unknown>
> extends BaseTransformContext.Interface<TRecord> {}

// ============================================================================
// OS Factory Interface
// ============================================================================

interface IOsTransformContextFactory extends BaseTransformContextFactory.Interface {
    create<T extends BaseRecord>(
        params: BaseTransformContextFactory.CreateParams<T>
    ): IOsTransformContext<T>;
}

// ============================================================================
// Abstractions
// ============================================================================

export const OsTransformContext = createAbstraction<IOsTransformContext>("Core/OsTransformContext");

export namespace OsTransformContext {
    export type Interface<TRecord = Record<string, unknown>> = IOsTransformContext<TRecord>;
}

export const OsTransformContextFactory = createAbstraction<IOsTransformContextFactory>(
    "Core/OsTransformContextFactory"
);

export namespace OsTransformContextFactory {
    export type Interface = IOsTransformContextFactory;
}

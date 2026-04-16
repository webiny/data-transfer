import { createAbstraction } from "~/base/index.ts";
import { BaseTransformContext } from "./BaseTransformContext.ts";

// ============================================================================
// OS Context Interface
// ============================================================================

interface IOsTransformContext<
    TRecord = Record<string, unknown>
> extends BaseTransformContext.Interface<TRecord> {}

// ============================================================================
// OS Factory Interface
// ============================================================================

interface ICreateParams<T extends BaseTransformContext.BaseRecord> {
    record: T;
}

interface IOsTransformContextFactory {
    create<T extends BaseTransformContext.BaseRecord>(
        params: ICreateParams<T>
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
    export type CreateParams<T extends BaseTransformContext.BaseRecord> = ICreateParams<T>;
}

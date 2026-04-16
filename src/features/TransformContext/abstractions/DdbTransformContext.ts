import { createAbstraction } from "~/base/index.ts";
import { BaseTransformContext } from "./BaseTransformContext.ts";

// ============================================================================
// DDB Context Interface
// ============================================================================

interface IDdbTransformContext<
    TRecord = Record<string, unknown>
> extends BaseTransformContext.Interface<TRecord> {
    copyFile(sourceKey: string, targetKey: string): void;
    getFile(key: string): Promise<Buffer | null>;
}

// ============================================================================
// DDB Factory Interface
// ============================================================================

interface ICreateParams<T extends BaseTransformContext.BaseRecord> {
    record: T;
}

interface IDdbTransformContextFactory {
    create<T extends BaseTransformContext.BaseRecord>(
        params: ICreateParams<T>
    ): IDdbTransformContext<T>;
}

// ============================================================================
// Abstractions
// ============================================================================

export const DdbTransformContext = createAbstraction<IDdbTransformContext>(
    "Core/DdbTransformContext"
);

export namespace DdbTransformContext {
    export type Interface<TRecord = Record<string, unknown>> = IDdbTransformContext<TRecord>;
}

export const DdbTransformContextFactory = createAbstraction<IDdbTransformContextFactory>(
    "Core/DdbTransformContextFactory"
);

export namespace DdbTransformContextFactory {
    export type Interface = IDdbTransformContextFactory;
    export type CreateParams<T extends BaseTransformContext.BaseRecord> = ICreateParams<T>;
}

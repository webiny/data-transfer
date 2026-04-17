import { createAbstraction } from "~/base/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { BaseTransformContext, BaseTransformContextFactory } from "./BaseTransformContext.ts";

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

interface IDdbTransformContextFactory extends BaseTransformContextFactory.Interface {
    create<T extends BaseRecord>(
        params: BaseTransformContextFactory.CreateParams<T>
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
}

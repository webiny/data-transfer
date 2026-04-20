import { createAbstraction } from "~/base/index.ts";
import type { ModelProvider } from "~/features/ModelProvider/abstractions/ModelProvider.ts";
import type { Cache } from "~/tools/Cache/abstractions/Cache.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { Command } from "~/domain/transform/commands/Command.ts";

// ============================================================================
// Base Context Interface
// ============================================================================

interface IBaseTransformContext<TRecord = Record<string, unknown>> {
    record: TRecord;
    readonly original: Readonly<TRecord>;
    readonly commands: Commands;
    readonly modelProvider: ModelProvider.Interface;
    readonly cache: Cache.Interface;
    replace<TNew>(newRecord: TNew): void;
    putRecord(record: Record<string, unknown>): void;
    queryRecord(pk: string, sk?: string): Promise<Record<string, unknown> | null>;
    /**
     * Push a command to the bag. Convenience over `commands.add(cmd)`. Slice
     * helpers (in the upcoming per-command-processor refactor) use this;
     * transformers reach for it when emitting custom command types no slice
     * helper provides.
     */
    addCommand(cmd: Command): void;
}

// ============================================================================
// Base Factory Interface
// ============================================================================

interface ICreateParams<T extends BaseRecord> {
    record: T;
}

interface IBaseTransformContextFactory {
    create<T extends BaseRecord>(params: ICreateParams<T>): IBaseTransformContext<T>;
}

// ============================================================================
// Abstractions
// ============================================================================

export const BaseTransformContext = createAbstraction<IBaseTransformContext>(
    "Core/BaseTransformContext"
);

export namespace BaseTransformContext {
    export type Interface<TRecord = Record<string, unknown>> = IBaseTransformContext<TRecord>;
}

export const BaseTransformContextFactory = createAbstraction<IBaseTransformContextFactory>(
    "Core/BaseTransformContextFactory"
);

export namespace BaseTransformContextFactory {
    export type Interface = IBaseTransformContextFactory;
    export type CreateParams<T extends BaseRecord> = ICreateParams<T>;
}

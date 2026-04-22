import { createAbstraction } from "~/base/index.ts";
import type { Command } from "~/domain/transform/commands/Command.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { ModelProvider } from "~/features/ModelProvider/abstractions/ModelProvider.ts";
import type { Cache } from "~/tools/Cache/abstractions/Cache.ts";

// ============================================================================
// Base Context Interface
// ============================================================================

interface IBaseTransformContext<TRecord = unknown> {
    record: TRecord;
    readonly original: Readonly<TRecord>;
    readonly modelProvider: ModelProvider.Interface;
    readonly cache: Cache.Interface;
    replace(newRecord: TRecord): void;
    /**
     * Push a command to the bag. Slice helpers (DdbProcessor.putRecord,
     * S3Processor.copyFile, OsProcessor.putRecord, etc.) use this
     * internally. Transformers reach for slice helpers when available;
     * reach for addCommand directly when emitting custom command types
     * no slice helper provides.
     */
    addCommand(cmd: Command): void;
}

// ============================================================================
// Base Factory Interface
// ============================================================================

interface ICreateParams<TRecord> {
    record: TRecord;
}

interface IBaseContextCreateResult<TRecord> {
    ctx: IBaseTransformContext<TRecord>;
    commands: Commands;
}

interface IBaseTransformContextFactory {
    create<TRecord>(params: ICreateParams<TRecord>): IBaseContextCreateResult<TRecord>;
}

// ============================================================================
// Abstractions
// ============================================================================

export const BaseTransformContext = createAbstraction<IBaseTransformContext>(
    "Core/BaseTransformContext"
);

export namespace BaseTransformContext {
    export type Interface<TRecord = unknown> = IBaseTransformContext<TRecord>;
}

export const BaseTransformContextFactory = createAbstraction<IBaseTransformContextFactory>(
    "Core/BaseTransformContextFactory"
);

export namespace BaseTransformContextFactory {
    export type Interface = IBaseTransformContextFactory;
    export type CreateParams<TRecord> = ICreateParams<TRecord>;
    export type CreateResult<TRecord> = IBaseContextCreateResult<TRecord>;
}

import { createAbstraction } from "~/base/index.js";
import type { Command } from "~/domain/transform/commands/Command.js";
import type { Commands } from "~/domain/transform/commands/Commands.js";
import type { ModelProvider } from "~/features/ModelProvider/abstractions/ModelProvider.js";
import type { Cache } from "~/tools/Cache/abstractions/Cache.js";
import type { Logger } from "~/tools/Logger/abstractions/Logger.js";
import { CompressionHandler } from "@webiny/utils/exports/api.js";

// ============================================================================
// Base Context Interface
// ============================================================================

interface IBaseTransformContext<TRecord = unknown> {
    record: TRecord;
    readonly original: Readonly<TRecord>;
    readonly modelProvider: ModelProvider.Interface;
    readonly cache: Cache.Interface;
    readonly logger: Logger.Interface;
    readonly compressionHandler: CompressionHandler.Interface;
    replace(newRecord: TRecord): void;
    /**
     * Push a command to the bag. Slice helpers (DdbProcessor.putRecord,
     * S3Processor.copyFile, OsProcessor.putRecord, etc.) use this
     * internally. Transformers reach for slice helpers when available;
     * reach for addCommand directly when emitting custom command types
     * no slice helper provides.
     */
    addCommand(cmd: Command): void;
    /**
     * Suppress all writes for this record. Once called, isBlackholed becomes
     * true and the pipeline runner discards every command in the bag before
     * forwarding to processors. The call is irreversible within the record
     * lifecycle — each factory.create() starts a fresh, un-blackholed ctx.
     */
    blackhole(): void;
    readonly isBlackholed: boolean;
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

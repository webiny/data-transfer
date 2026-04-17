import { createAbstraction } from "~/base/index.ts";
import type { ModelProvider } from "~/features/ModelProvider/abstractions/ModelProvider.ts";
import type { Cache } from "~/features/Cache/abstractions/Cache.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { Command } from "~/domain/transform/types/commands.ts";

// ============================================================================
// Base Context Interface
// ============================================================================

interface IBaseTransformContext<TRecord = Record<string, unknown>> {
    record: TRecord;
    readonly original: Readonly<TRecord>;
    readonly commands: Command[];
    readonly modelProvider: ModelProvider.Interface;
    readonly cache: Cache.Interface;
    replace<TNew>(newRecord: TNew): void;
    putRecord(record: Record<string, unknown>): void;
    queryRecord(pk: string, sk?: string): Promise<Record<string, unknown> | null>;
    executePipeline(pipeline: any, records: Record<string, unknown>[]): Promise<Command[]>;
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

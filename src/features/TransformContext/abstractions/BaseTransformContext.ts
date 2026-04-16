import { createAbstraction } from "~/base/index.ts";
import type { ModelProvider } from "~/features/ModelProvider/abstractions/ModelProvider.ts";
import type { Cache } from "~/features/Cache/abstractions/Cache.ts";

// ============================================================================
// Record Types
// ============================================================================

interface IBaseRecord {
    PK: string;
    SK: string;
    _et: string;
    _ct: string;
    _md: string;
    TYPE: string;
    [key: string]: unknown;
}

interface IDdbRecord extends IBaseRecord {
    GSI1_PK: string;
    GSI1_SK: string;
    GSI2_PK: string;
    GSI2_SK: string;
}

interface IOsRecord extends IBaseRecord {
    data: { value: string; compression: string };
    index: string;
}

// ============================================================================
// Command Types
// ============================================================================

interface IPutRecordCommand {
    type: "PUT_RECORD";
    table: string;
    record: Record<string, unknown>;
}

interface IS3CopyCommand {
    type: "S3_COPY";
    sourceBucket: string;
    sourceKey: string;
    targetBucket: string;
    targetKey: string;
}

type ICommand = IPutRecordCommand | IS3CopyCommand;

interface IPipelineResult {
    commands: ICommand[];
}

// ============================================================================
// Base Context Interface
// ============================================================================

interface IBaseTransformContext<TRecord = Record<string, unknown>> {
    record: TRecord;
    readonly original: Readonly<TRecord>;
    readonly commands: ICommand[];
    readonly modelProvider: ModelProvider.Interface;
    readonly cache: Cache.Interface;
    replace<TNew>(newRecord: TNew): void;
    putRecord(record: Record<string, unknown>): void;
    queryRecord(pk: string, sk?: string): Promise<Record<string, unknown> | null>;
    executePipeline(pipeline: any, records: Record<string, unknown>[]): Promise<ICommand[]>;
}

// ============================================================================
// Abstraction (used only as namespace carrier — not resolved from container)
// ============================================================================

export const BaseTransformContext = createAbstraction<IBaseTransformContext>(
    "Core/BaseTransformContext"
);

export namespace BaseTransformContext {
    export type Interface<TRecord = Record<string, unknown>> = IBaseTransformContext<TRecord>;
    export type BaseRecord = IBaseRecord;
    export type DdbRecord = IDdbRecord;
    export type OsRecord = IOsRecord;
    export type Command = ICommand;
    export type PutRecordCommand = IPutRecordCommand;
    export type S3CopyCommand = IS3CopyCommand;
    export type PipelineResult = IPipelineResult;
}

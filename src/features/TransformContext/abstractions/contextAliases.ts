import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { BaseTransformContext } from "./BaseTransformContext.ts";

// ============================================================================
// Processor slices
// ----------------------------------------------------------------------------
// Per-processor helper shapes contributed onto the effective transformer ctx.
// Declared inline here (rather than re-imported) to keep the aliases module
// self-contained and avoid circular dependencies with processor packages —
// transformer authors import from this file only.
// ============================================================================

interface DdbProcessorSlice {
    putRecord(record: Record<string, unknown>): void;
    querySourceRecord<T extends Record<string, unknown> = Record<string, unknown>>(
        pk: string,
        sk?: string
    ): Promise<T | null>;
    queryTargetRecord<T extends Record<string, unknown> = Record<string, unknown>>(
        pk: string,
        sk?: string
    ): Promise<T | null>;
}

interface S3ProcessorSlice {
    copyFile(sourceKey: string, targetKey: string): void;
    getFile(key: string): Promise<Buffer | null>;
}

interface OsProcessorSlice {
    putRecord(record: Record<string, unknown>): void;
    querySourceRecord<T extends Record<string, unknown> = Record<string, unknown>>(
        pk: string,
        sk?: string
    ): Promise<T | null>;
    queryTargetRecord<T extends Record<string, unknown> = Record<string, unknown>>(
        pk: string,
        sk?: string
    ): Promise<T | null>;
}

// ============================================================================
// DdbCoreTransformContext
// ----------------------------------------------------------------------------
// Minimal DDB-mode ctx — Base + DdbProcessorSlice only. Use for transformers
// that need record-level DDB helpers (querySourceRecord, queryTargetRecord,
// putRecord) but do not touch S3. Pipelines that register only DdbProcessor
// (no S3Processor) produce this effective shape.
// ============================================================================

interface IDdbCoreTransformContext<TRecord = BaseRecord>
    extends BaseTransformContext.Interface<TRecord>, DdbProcessorSlice {}

export namespace DdbCoreTransformContext {
    export type Interface<TRecord = BaseRecord> = IDdbCoreTransformContext<TRecord>;
}

// ============================================================================
// DdbTransformContext
// ----------------------------------------------------------------------------
// Effective context visible to transformers in DDB-mode pipelines that
// register both DdbProcessor and S3Processor — the default shape for
// v5-to-v6 DDB migrations.
// ============================================================================

interface IDdbTransformContext<TRecord = BaseRecord>
    extends BaseTransformContext.Interface<TRecord>, DdbProcessorSlice, S3ProcessorSlice {}

export namespace DdbTransformContext {
    export type Interface<TRecord = BaseRecord> = IDdbTransformContext<TRecord>;
}

// ============================================================================
// OsTransformContext
// ----------------------------------------------------------------------------
// Effective context visible to transformers in OS-mode pipelines. OS mode
// only registers OsProcessor; S3 copies are not part of the OS path.
// ============================================================================

interface IOsTransformContext<TRecord = BaseRecord>
    extends BaseTransformContext.Interface<TRecord>, OsProcessorSlice {}

export namespace OsTransformContext {
    export type Interface<TRecord = BaseRecord> = IOsTransformContext<TRecord>;
}

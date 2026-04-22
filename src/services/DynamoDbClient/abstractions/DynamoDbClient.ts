import { createAbstraction } from "~/base/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Minimal DynamoDB record shape — only PK+SK guaranteed.
 * Used for queries and writes where we don't assume Webiny's extra fields.
 */
export interface DatabaseRecord {
    PK: string;
    SK: string;
    [key: string]: unknown;
}

export interface ScanOptions {
    segment?: number;
    totalSegments?: number;
}

export interface QueryOptions {
    indexName?: string;
    pkAttribute?: string;
    limit?: number;
    sortKeyCondition?: {
        operator: "beginsWith" | "equals";
        value: string;
    };
}

export interface IDynamoDbClient {
    /**
     * Scans yield DynamoDB items as T. T defaults to BaseRecord (Webiny shape:
     * PK, SK, _et, _ct, _md, TYPE) but callers with tighter knowledge of the
     * source schema (e.g., OS companion table adds `index` at the root) can
     * pass a narrower generic to get typed access without casts. Runtime does
     * not validate T — the bound (DatabaseRecord) only promises PK+SK.
     */
    scan<T extends DatabaseRecord = BaseRecord>(
        tableName: string,
        options?: ScanOptions
    ): AsyncIterable<T>;
    query<T extends DatabaseRecord>(
        tableName: string,
        pk: string,
        sk?: string,
        options?: QueryOptions
    ): Promise<T[]>;
    batchPut<T extends DatabaseRecord>(tableName: string, records: T[]): Promise<void>;
}

// ============================================================================
// Abstractions
// ============================================================================

export const SourceDynamoDbClient = createAbstraction<IDynamoDbClient>("Core/SourceDynamoDbClient");
export const TargetDynamoDbClient = createAbstraction<IDynamoDbClient>("Core/TargetDynamoDbClient");

export namespace SourceDynamoDbClient {
    export type Interface = IDynamoDbClient;
    export type Record = DatabaseRecord;
    export type Scan = ScanOptions;
    export type Query = QueryOptions;
}

export namespace TargetDynamoDbClient {
    export type Interface = IDynamoDbClient;
    export type Record = DatabaseRecord;
    export type Scan = ScanOptions;
    export type Query = QueryOptions;
}

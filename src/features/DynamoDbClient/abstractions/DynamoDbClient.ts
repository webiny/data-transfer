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
    limit?: number;
    sortKeyCondition?: {
        operator: "beginsWith" | "equals";
        value: string;
    };
}

export interface IDynamoDbClient {
    /** Scans emit Webiny records — all have PK, SK, _et, _ct, _md, TYPE */
    scan(tableName: string, options?: ScanOptions): AsyncIterable<BaseRecord>;
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

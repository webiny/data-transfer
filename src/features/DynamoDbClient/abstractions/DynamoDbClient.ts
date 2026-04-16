import { createAbstraction } from "@/src/base/index.ts";

// ============================================================================
// Types
// ============================================================================

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
    scan<T extends DatabaseRecord>(tableName: string, options?: ScanOptions): AsyncIterable<T>;
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
